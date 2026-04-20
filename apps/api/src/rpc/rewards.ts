import { fetchRest } from "./rest.js";
import {
  DENOM_CONVERSIONS,
  fetchDenomTrace,
  fetchTokenUsdPrice,
} from "./pricing.js";

/** Benchmark: 10,000 LAVA in ulava / base units */
export const APR_BENCHMARK_ULAVA = 10_000_000_000;
export const APR_BENCHMARK_LAVA = 10_000;
const APR_BENCHMARK_DENOM = "ulava";

export interface EstimatedRewardsResponse {
  info: Array<{
    source: string;
    amount: { denom: string; amount: string } | Array<{ denom: string; amount: string }>;
  }>;
  total: Array<{ denom: string; amount: string }>;
  recommended_block?: string;
}

/** IBC test denoms to skip (matching jsinfo) */
const TEST_DENOMS = new Set([
  "ibc/E3FCBEDDBAC500B1BAB90395C7D1E4F33D9B9ECFE82A16ED7D7D141A0152323F",
]);

/** Token breakdown matching jsinfo RewardAmount */
export interface RewardToken {
  source_denom: string;
  resolved_amount: string;
  resolved_denom: string;
  display_denom: string;
  display_amount: string;
  value_usd: string;
}

export interface ProcessedRewards {
  totalUsd: number;
  tokens: RewardToken[];
}

/** Convert multi-denom reward array to USD total + per-token breakdown.
 *  When `priceOverrides` is passed, its entries (keyed by base denom, e.g.
 *  "lava") take precedence over the live price cache. Used by historical-
 *  block rewards queries to price tokens at the block's date rather than
 *  the current CoinGecko price. */
async function processRewardTokens(
  rewards: Array<{ denom: string; amount: string }>,
  priceOverrides?: Record<string, number>,
): Promise<ProcessedRewards> {
  const tokens: RewardToken[] = [];
  let totalUsd = 0;

  for (const { denom, amount } of rewards) {
    if (TEST_DENOMS.has(denom)) continue;

    // Resolve IBC denoms to their base denom
    let rawDenom = denom;
    let resolvedDenom = denom;
    if (denom.startsWith("ibc/")) {
      const resolved = await fetchDenomTrace(denom.slice(4));
      if (!resolved) continue;
      rawDenom = resolved;
      resolvedDenom = resolved;
    }

    const conversion = DENOM_CONVERSIONS[rawDenom];
    if (!conversion) continue;

    const displayAmount = divideByFactor(amount, conversion.factor);
    const baseAmount = parseFloat(displayAmount);
    if (!isFinite(baseAmount) || baseAmount <= 0) continue;

    const price = priceOverrides?.[conversion.baseDenom]
      ?? await fetchTokenUsdPrice(conversion.baseDenom);
    const usd = price > 0 ? baseAmount * price : 0;
    totalUsd += usd;

    tokens.push({
      source_denom: denom,
      resolved_amount: formatTokenStr(amount),
      resolved_denom: resolvedDenom,
      display_denom: conversion.baseDenom,
      display_amount: displayAmount,
      value_usd: `$${formatTokenStr(usd.toFixed(14))}`,
    });
  }

  return { totalUsd, tokens };
}

/** Strip trailing zeros from a decimal string (matching jsinfo FormatTokenAmount) */
function formatTokenStr(s: string): string {
  const [whole = "", frac] = s.split(".");
  if (!frac) return whole;
  const trimmed = frac.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

/** String-based division to avoid floating-point noise for token amounts.
 *  Shifts the decimal point left by the number of digits in `divisor`.
 *  e.g. divideStr("23584370", 1_000_000) → "23.584370" → "23.58437" */
function divideByFactor(raw: string, factor: number): string {
  // Strip any existing decimal (RPC may return "123.000000000000000000")
  const cleaned = formatTokenStr(raw);
  const digits = Math.round(Math.log10(factor));
  const [intPart, decPart = ""] = cleaned.split(".");
  const combined = intPart + decPart;
  const shiftedDecPos = combined.length - digits - decPart.length;

  // Pad with leading zeros if the number is smaller than the factor
  const padded = shiftedDecPos <= 0
    ? "0." + "0".repeat(-shiftedDecPos) + combined
    : combined.slice(0, shiftedDecPos) + "." + combined.slice(shiftedDecPos);

  return formatTokenStr(padded || "0");
}

/** Fetch estimated rewards for a provider/validator — returns USD total + token breakdown */
export async function fetchEstimatedRewards(
  type: "provider" | "validator",
  address: string,
): Promise<ProcessedRewards> {
  try {
    const data = await fetchRest<EstimatedRewardsResponse>(
      `/lavanet/lava/subscription/estimated_${type}_rewards/${address}/${APR_BENCHMARK_ULAVA}${APR_BENCHMARK_DENOM}`,
    );
    return await processRewardTokens(data.total ?? []);
  } catch {
    return { totalUsd: 0, tokens: [] };
  }
}

/** Per-source reward breakdown under one spec. Mirrors the chain RPC's raw
 *  source strings (e.g. "Boost: ETH1", "Pools: ETH1", "Subscription: ETH1") so
 *  consumers can categorize by source prefix across specs. */
export interface RewardsSourceBreakdown {
  source: string;
  tokens: RewardToken[];
  total_usd: number;
}

export interface RewardsBySpecEntry {
  chain: string;
  spec: string;
  tokens: RewardToken[];
  total_usd: number;
  sources: RewardsSourceBreakdown[];
}

/** Fetch the raw estimated_provider_rewards chain response for one provider.
 *  Returns an empty structure on error so callers can iterate without throwing. */
export async function fetchRawProviderRewards(
  address: string,
  blockHeight?: number,
): Promise<EstimatedRewardsResponse> {
  try {
    return await fetchRest<EstimatedRewardsResponse>(
      `/lavanet/lava/subscription/estimated_provider_rewards/${address}/`,
      blockHeight,
    );
  } catch {
    return { info: [], total: [] };
  }
}

/** Extract the set of base denoms (post-IBC-resolution) that appear in one or
 *  more raw estimated_provider_rewards responses. Used by the route to fetch
 *  historical prices ONLY for denoms that actually appear — fetching all 22
 *  known denoms would blow past the gateway timeout under CoinGecko throttling. */
export async function extractBaseDenoms(
  raws: EstimatedRewardsResponse[],
): Promise<Set<string>> {
  const rawDenoms = new Set<string>();
  for (const raw of raws) {
    for (const entry of raw.info ?? []) {
      const amounts = Array.isArray(entry.amount) ? entry.amount : [entry.amount];
      for (const coin of amounts) {
        if (!TEST_DENOMS.has(coin.denom)) rawDenoms.add(coin.denom);
      }
    }
  }

  const baseDenoms = new Set<string>();
  for (const d of rawDenoms) {
    let effectiveDenom: string | null = d;
    if (d.startsWith("ibc/")) {
      effectiveDenom = await fetchDenomTrace(d.slice(4));
      if (!effectiveDenom) continue;
    }
    const baseDenom = DENOM_CONVERSIONS[effectiveDenom]?.baseDenom;
    if (baseDenom) baseDenoms.add(baseDenom);
  }
  return baseDenoms;
}

/** Convert a raw chain response into the per-spec breakdown. Pulls prices from
 *  `priceOverrides` (keyed by base denom) when provided, else the live cache. */
export async function processRawProviderRewards(
  raw: EstimatedRewardsResponse,
  specNameMap: Map<string, string>,
  priceOverrides?: Record<string, number>,
): Promise<RewardsBySpecEntry[]> {
  // Each info entry has source like "Boost: ETH1" (prefix:suffix). Extract
  // spec from the suffix; preserve the raw source string so consumers can
  // categorize by Boost / Pools / Subscription. Track per-(spec, source)
  // denom sums plus per-spec totals.
  interface SourceAcc { source: string; tokens: Map<string, number> }
  interface SpecAcc { sources: Map<string, SourceAcc>; tokens: Map<string, number> }
  const bySpec = new Map<string, SpecAcc>();

  for (const entry of raw.info ?? []) {
    const parts = (entry.source as string).split(": ");
    const spec = parts.length > 1 ? parts[1] : parts[0];
    if (!spec) continue;

    const specKey = spec.toLowerCase();
    let specAcc = bySpec.get(specKey);
    if (!specAcc) {
      specAcc = { sources: new Map(), tokens: new Map() };
      bySpec.set(specKey, specAcc);
    }

    let sourceAcc = specAcc.sources.get(entry.source);
    if (!sourceAcc) {
      sourceAcc = { source: entry.source, tokens: new Map() };
      specAcc.sources.set(entry.source, sourceAcc);
    }

    const amounts = Array.isArray(entry.amount) ? entry.amount : [entry.amount];
    for (const coin of amounts) {
      if (TEST_DENOMS.has(coin.denom)) continue;
      const amt = parseFloat(coin.amount) || 0;
      sourceAcc.tokens.set(coin.denom, (sourceAcc.tokens.get(coin.denom) ?? 0) + amt);
      specAcc.tokens.set(coin.denom, (specAcc.tokens.get(coin.denom) ?? 0) + amt);
    }
  }

  async function denomMapToBreakdown(denomMap: Map<string, number>): Promise<{ tokens: RewardToken[]; total_usd: number }> {
    const tokens: RewardToken[] = [];
    let totalUsd = 0;
    for (const [denom, amount] of denomMap) {
      const processed = await processRewardTokens(
        [{ denom, amount: amount.toString() }],
        priceOverrides,
      );
      tokens.push(...processed.tokens);
      totalUsd += processed.totalUsd;
    }
    return { tokens, total_usd: totalUsd };
  }

  const results: RewardsBySpecEntry[] = [];
  for (const [specKey, specAcc] of bySpec) {
    const specBreakdown = await denomMapToBreakdown(specAcc.tokens);
    const sources: RewardsSourceBreakdown[] = [];
    for (const [, sourceAcc] of specAcc.sources) {
      const srcBreakdown = await denomMapToBreakdown(sourceAcc.tokens);
      sources.push({
        source: sourceAcc.source,
        tokens: srcBreakdown.tokens,
        total_usd: srcBreakdown.total_usd,
      });
    }

    results.push({
      chain: specNameMap.get(specKey.toUpperCase()) ?? specKey.toUpperCase(),
      spec: specKey.toUpperCase(),
      tokens: specBreakdown.tokens,
      total_usd: specBreakdown.total_usd,
      sources,
    });
  }

  return results;
}

/**
 * Fetch a provider's actual earned rewards (no benchmark amount) and group by spec.
 * Composes fetchRawProviderRewards + processRawProviderRewards for callers that
 * don't need the raw/extract/process split (e.g. APR's computeAllProvidersApr).
 *
 * Pass blockHeight to query historical chain state (archive node required).
 * Pass priceOverrides (keyed by base denom, e.g. "lava") to price tokens at a
 * specific point in time.
 */
export async function fetchRewardsBySpec(
  address: string,
  specNameMap: Map<string, string>,
  blockHeight?: number,
  priceOverrides?: Record<string, number>,
): Promise<RewardsBySpecEntry[]> {
  const raw = await fetchRawProviderRewards(address, blockHeight);
  return processRawProviderRewards(raw, specNameMap, priceOverrides);
}

export interface ClaimableRewardEntry {
  amount: string;     // display amount in base units (e.g. "1.23" lava)
  denom: string;      // base denom (e.g. "lava")
  usdcValue: string;  // numeric USD string (no $)
  provider: string;
}

/** Convert multi-denom claimable rewards to jsinfo-shape entries. */
export async function processClaimableRewards(
  rewards: Array<{ denom: string; amount: string }>,
  provider: string,
): Promise<ClaimableRewardEntry[]> {
  const processed = await processRewardTokens(rewards);
  return processed.tokens.map((t) => ({
    amount: t.display_amount,
    denom: t.display_denom,
    usdcValue: t.value_usd.startsWith("$") ? t.value_usd.slice(1) : t.value_usd,
    provider,
  }));
}

// ── Validator reward breakdown helper (shared between validators.ts and rewards) ──

interface RewardCoin { denom: string; amount: string }

export interface TokenBreakdown {
  tokens: RewardToken[];
  total_usd: number;
}

export const EMPTY_BREAKDOWN: TokenBreakdown = { tokens: [], total_usd: 0 };

export async function rewardsToBreakdown(rewards: RewardCoin[] | undefined): Promise<TokenBreakdown> {
  if (!rewards || rewards.length === 0) return EMPTY_BREAKDOWN;
  const processed = await processRewardTokens(rewards);
  return { tokens: processed.tokens, total_usd: processed.totalUsd };
}
