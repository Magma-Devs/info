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

/** Convert multi-denom reward array to USD total + per-token breakdown */
async function processRewardTokens(
  rewards: Array<{ denom: string; amount: string }>,
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

    const price = await fetchTokenUsdPrice(conversion.baseDenom);
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

export interface RewardsBySpecEntry {
  chain: string;
  spec: string;
  tokens: RewardToken[];
  total_usd: number;
}

/**
 * Fetch a provider's actual earned rewards (no benchmark amount) and group by spec.
 * Matches jsinfo's rewards_last_month: calls estimated_provider_rewards/{addr}/
 * then splits "Boost: ETH1", "Pools: ETH1", "Subscription: ETH1" into per-spec groups.
 *
 * Pass blockHeight to query historical chain state (archive node required).
 * Note: USD values still use current CoinGecko prices even for historical blocks —
 * matches the old Job 2 behavior where CoinGecko was called at pipeline-run time.
 */
export async function fetchRewardsBySpec(
  address: string,
  specNameMap: Map<string, string>,
  blockHeight?: number,
): Promise<RewardsBySpecEntry[]> {
  try {
    const data = await fetchRest<EstimatedRewardsResponse>(
      `/lavanet/lava/subscription/estimated_provider_rewards/${address}/`,
      blockHeight,
    );

    // Group info entries by spec (collapse Boost/Pools/Subscription sources)
    const bySpec = new Map<string, { tokens: Map<string, { amount: number; denom: string }>; totalUsd: number }>();

    for (const entry of data.info ?? []) {
      const parts = (entry.source as string).split(": ");
      const spec = parts.length > 1 ? parts[1] : parts[0];
      if (!spec) continue;

      const key = spec.toLowerCase();
      const group = bySpec.get(key) ?? { tokens: new Map(), totalUsd: 0 };

      const amounts = Array.isArray(entry.amount) ? entry.amount : [entry.amount];
      for (const coin of amounts) {
        if (TEST_DENOMS.has(coin.denom)) continue;
        const existing = group.tokens.get(coin.denom);
        const amt = parseFloat(coin.amount) || 0;
        if (existing) {
          existing.amount += amt;
        } else {
          group.tokens.set(coin.denom, { amount: amt, denom: coin.denom });
        }
      }

      bySpec.set(key, group);
    }

    // Convert to output format with USD values
    const results: RewardsBySpecEntry[] = [];
    for (const [specKey, group] of bySpec) {
      const tokens: RewardToken[] = [];
      let specUsd = 0;

      for (const [, coin] of group.tokens) {
        const processed = await processRewardTokens([
          { denom: coin.denom, amount: coin.amount.toString() },
        ]);
        tokens.push(...processed.tokens);
        specUsd += processed.totalUsd;
      }

      results.push({
        chain: specNameMap.get(specKey.toUpperCase()) ?? specKey.toUpperCase(),
        spec: specKey.toUpperCase(),
        tokens,
        total_usd: specUsd,
      });
    }

    return results;
  } catch {
    return [];
  }
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
