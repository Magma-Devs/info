import type { Redis } from "ioredis";
import { RPC_BATCH_SIZE } from "./rest.js";
import { prewarmPriceCache, fetchTokenUsdPrice } from "./pricing.js";
import {
  APR_BENCHMARK_LAVA,
  type RewardToken,
  type RewardsBySpecEntry,
  fetchEstimatedRewards,
  fetchRewardsBySpec,
} from "./rewards.js";
import {
  type ProviderSpecEntry,
  fetchAllProviders,
  fetchProvidersWithSpecs,
} from "./providers.js";
import { fetchBondedValidators } from "./validators.js";
import { fetchProviderAvatar } from "./keybase.js";

/** 80th percentile, capped at 30% — same thresholds as jsinfo */
const APR_PERCENTILE = 0.8;
const APR_MAX_PERCENTILE_CAP = 0.3;
const APR_MAX_INDIVIDUAL = 0.8;
const APR_MIN = 1e-11;

/** Percentile calculation matching jsinfo `CalculatePercentile` */
function calculatePercentile(values: number[], rank: number): number {
  if (values.length === 0 || rank < 0 || rank > 1) return 0;
  if (values.length === 1) return values[0]!;

  const sorted = [...values].sort((a, b) => a - b);
  const pos = Math.floor((sorted.length - 1) * rank);

  if (sorted.length % 2 === 0) {
    return sorted[pos]! + (sorted[pos + 1]! - sorted[pos]!) * rank;
  }
  return sorted[pos]!;
}

/** APR from monthly reward: (1 + rewardUsd/investedUsd)^12 - 1 */
function calculateApr(rewardUsd: number, investedUsd: number): number {
  if (investedUsd <= 0 || rewardUsd <= 0) return 0;
  const rate = rewardUsd / investedUsd;
  const apr = Math.pow(1 + rate, 12) - 1;
  if (!isFinite(apr) || apr < APR_MIN || apr > 100) return 0;
  return apr;
}

// --- Weighted APR history (Redis, matches jsinfo AprWeighted) ---

const APR_WEIGHTS = [0.4, 0.25, 0.15, 0.1, 0.05, 0.03, 0.02];
const APR_DAYS_TO_KEEP = 7;
const APR_HISTORY_TTL = 30 * 24 * 60 * 60; // 30 days

interface AprRecord { date: string; aprSum: number; count: number }
interface AprHistory { records: AprRecord[]; lastUpdated: string }

function aprHistoryKey(type: string, address: string): string {
  return `apr_history:${type}:${address}`;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

async function storeApr(redis: Redis, type: string, address: string, apr: number): Promise<void> {
  if (apr === 0) return;
  const key = aprHistoryKey(type, address);
  const today = todayStr();
  try {
    const raw = await redis.get(key);
    const history: AprHistory = raw ? JSON.parse(raw) : { records: [], lastUpdated: today };

    const rec = history.records.find((r) => r.date === today);
    if (rec) { rec.aprSum += apr; rec.count += 1; }
    else { history.records.push({ date: today, aprSum: apr, count: 1 }); }

    history.records = history.records
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, APR_DAYS_TO_KEEP);
    history.lastUpdated = today;

    await redis.set(key, JSON.stringify(history), "EX", APR_HISTORY_TTL);
  } catch { /* Redis failures are non-fatal */ }
}

async function getWeightedApr(redis: Redis, type: string, address: string): Promise<number | null> {
  try {
    const raw = await redis.get(aprHistoryKey(type, address));
    if (!raw) return null;
    const history: AprHistory = JSON.parse(raw);
    if (history.records.length === 0) return null;

    let weightedSum = 0;
    let weightSum = 0;
    for (let i = 0; i < history.records.length && i < APR_WEIGHTS.length; i++) {
      const record = history.records[i]!;
      const weight = APR_WEIGHTS[i]!;
      const avg = record.aprSum / record.count;
      weightedSum += avg * weight;
      weightSum += weight;
    }
    return weightSum > 0 ? weightedSum / weightSum : null;
  } catch {
    return null;
  }
}

/**
 * Compute APR percentiles matching jsinfo `/apr` response.
 *
 * For each active provider and bonded validator:
 *   1. Query `estimated_{type}_rewards` with a 10 000 LAVA benchmark
 *   2. Convert multi-denom rewards to USD via CoinGecko
 *   3. Compute APR via monthly compounding: (1 + monthlyRate)^12 - 1
 *   4. Store in 7-day weighted history (Redis, if available)
 *   5. Take 80th percentile, cap at 30%
 */
export async function computeAPR(redis?: Redis | null): Promise<{
  restaking_apr_percentile: number;
  staking_apr_percentile: number;
}> {
  // Pre-warm all token prices in a single CoinGecko call
  await prewarmPriceCache();

  const lavaPrice = await fetchTokenUsdPrice("lava");
  const investedUsd = APR_BENCHMARK_LAVA * lavaPrice;

  const [providers, validators] = await Promise.all([
    fetchAllProviders(),
    fetchBondedValidators(),
  ]);

  const providerAddresses = providers.map((p) => p.address);

  // Collect per-entity APRs (batched by RPC_BATCH_SIZE)
  const [providerAprs, validatorAprs] = await Promise.all([
    collectEntityAprs("provider", providerAddresses, investedUsd, redis),
    collectEntityAprs("validator", validators, investedUsd, redis),
  ]);

  return {
    restaking_apr_percentile: Math.min(
      calculatePercentile(providerAprs, APR_PERCENTILE),
      APR_MAX_PERCENTILE_CAP,
    ),
    staking_apr_percentile: Math.min(
      calculatePercentile(validatorAprs, APR_PERCENTILE),
      APR_MAX_PERCENTILE_CAP,
    ),
  };
}

/** Batch-fetch estimated rewards, compute APR per entity, apply weighted history */
async function collectEntityAprs(
  type: "provider" | "validator",
  addresses: string[],
  investedUsd: number,
  redis?: Redis | null,
): Promise<number[]> {
  const aprs: number[] = [];

  for (let i = 0; i < addresses.length; i += RPC_BATCH_SIZE) {
    const batch = addresses.slice(i, i + RPC_BATCH_SIZE);
    const rewards = await Promise.all(
      batch.map((addr) => fetchEstimatedRewards(type, addr)),
    );

    for (let j = 0; j < batch.length; j++) {
      const addr = batch[j]!;
      const currentApr = calculateApr(rewards[j]!.totalUsd, investedUsd);
      if (currentApr <= 0) continue;

      let finalApr = currentApr;
      if (redis) {
        await storeApr(redis, type, addr, currentApr);
        const weighted = await getWeightedApr(redis, type, addr);
        if (weighted !== null) finalApr = weighted;
      }

      if (finalApr > 0 && finalApr < APR_MAX_INDIVIDUAL) {
        aprs.push(finalApr);
      }
    }
  }

  return aprs;
}

/** Max display APR for individual providers (matching jsinfo) */
const MAX_DISPLAY_APR = 0.9;

/** Format APR as percentage string matching jsinfo format */
function formatAprPercent(apr: number): string {
  if (apr <= 0) return "-";
  if (apr > MAX_DISPLAY_APR) return "90.0%";
  return `${(apr * 100).toFixed(4)}%`;
}

/** Format commission as percentage string */
function formatCommission(commission: string): string {
  if (!commission) return "-";
  const n = parseFloat(commission);
  if (!isFinite(n)) return "-";
  return `${n.toFixed(1)}%`;
}

export interface AllProviderAprEntry {
  address: string;
  moniker: string;
  apr: string;
  commission: string;
  "30_days_cu_served": string;
  "30_days_relays_served": string;
  rewards_10k_lava_delegation: RewardToken[];
  rewards_last_month: RewardsBySpecEntry[];
  specs: ProviderSpecEntry[];
  stake: string;
  stakestatus: string;
  addons: string;
  extensions: string;
  delegateTotal: string;
  avatar: string | null;
}

/**
 * Compute per-provider APR data matching jsinfo `/all_providers_apr`.
 *
 * Returns array of provider objects with APR, commission, 30d relay data,
 * per-token reward breakdown, specs, and avatar.
 */
export async function computeAllProvidersApr(
  relay30d: Map<string, { cu: string; relays: string }>,
  redis?: Redis | null,
): Promise<AllProviderAprEntry[]> {
  // Pre-warm all token prices in a single CoinGecko call
  await prewarmPriceCache();

  const lavaPrice = await fetchTokenUsdPrice("lava");
  const investedUsd = APR_BENCHMARK_LAVA * lavaPrice;

  const { providers: providerMap, specNames } = await fetchProvidersWithSpecs();
  const addresses = Array.from(providerMap.keys());
  const results: AllProviderAprEntry[] = [];

  for (let i = 0; i < addresses.length; i += RPC_BATCH_SIZE) {
    const batch = addresses.slice(i, i + RPC_BATCH_SIZE);
    const [rewardResults, rewardsLastMonthResults, avatarResults] = await Promise.all([
      Promise.all(batch.map((addr) => fetchEstimatedRewards("provider", addr))),
      Promise.all(batch.map((addr) => fetchRewardsBySpec(addr, specNames))),
      Promise.all(batch.map((addr) => {
        const p = providerMap.get(addr)!;
        return fetchProviderAvatar(addr, p.identity || undefined).catch(() => null);
      })),
    ]);

    for (let j = 0; j < batch.length; j++) {
      const addr = batch[j]!;
      const provider = providerMap.get(addr)!;
      const rewards = rewardResults[j]!;
      const rewardsLastMonth = rewardsLastMonthResults[j]!;
      const avatar = avatarResults[j] ?? null;
      const currentApr = calculateApr(rewards.totalUsd, investedUsd);

      let finalApr = currentApr;
      if (redis && currentApr > 0) {
        await storeApr(redis, "provider", addr, currentApr);
        const weighted = await getWeightedApr(redis, "provider", addr);
        if (weighted !== null) finalApr = weighted;
      }

      const relay = relay30d.get(addr);
      const firstSpec = provider.specs[0];

      results.push({
        address: addr,
        moniker: provider.moniker || "-",
        apr: formatAprPercent(finalApr),
        commission: formatCommission(provider.commission),
        "30_days_cu_served": relay?.cu ?? "-",
        "30_days_relays_served": relay?.relays ?? "-",
        rewards_10k_lava_delegation: rewards.tokens,
        rewards_last_month: rewardsLastMonth,
        specs: provider.specs,
        stake: firstSpec?.stake ?? "",
        stakestatus: firstSpec ? "Active" : "",
        addons: firstSpec?.addons ?? "",
        extensions: firstSpec?.extensions ?? "",
        delegateTotal: firstSpec?.delegateTotal ?? "",
        avatar,
      });
    }
  }

  return results;
}
