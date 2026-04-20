import pino from "pino";
import { ulavaToLavaNumber } from "@info/shared/utils";
import { config } from "../config.js";
import { fetchRest } from "./rest.js";
import { fetchStakingPool } from "./supply.js";

const logger = pino({ name: "pricing" });

// ── CoinGecko rate-limit-aware fetch ────────────────────────────────────────
// Free-tier throttles ~10-30 req/min. Honor Retry-After on 429; otherwise use
// exponential backoff. Throws after maxAttempts so callers can distinguish
// "couldn't fetch" from "data says zero". Critical for historical pricing:
// silently falling back to current price would bake wrong USD into the 1-year
// response cache.
const COINGECKO_MAX_ATTEMPTS = 5;
const COINGECKO_MAX_BACKOFF_MS = 60_000;

async function coingeckoFetch(url: string): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= COINGECKO_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (res.status !== 429) return res;

      const retryAfter = parseInt(res.headers.get("retry-after") ?? "0", 10);
      const backoffMs = Math.min(
        COINGECKO_MAX_BACKOFF_MS,
        retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000,
      );
      if (attempt === COINGECKO_MAX_ATTEMPTS) {
        throw new Error(`CoinGecko 429 after ${COINGECKO_MAX_ATTEMPTS} attempts: ${url}`);
      }
      logger.warn({ url, attempt, backoffMs }, "CoinGecko 429, backing off");
      await new Promise((r) => setTimeout(r, backoffMs));
    } catch (e) {
      lastErr = e;
      if (attempt === COINGECKO_MAX_ATTEMPTS) throw e;
      const backoffMs = Math.min(COINGECKO_MAX_BACKOFF_MS, 2 ** attempt * 1000);
      logger.warn({ url, attempt, err: String(e) }, "CoinGecko fetch error, retrying");
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastErr ?? new Error("coingeckoFetch: unreachable");
}

/** In-memory price cache (5 min TTL) — shared across fetchLavaUsdPrice + fetchTokenUsdPrice + prewarmPriceCache */
const priceCache = new Map<string, { price: number; ts: number }>();
const PRICE_CACHE_MS = 300_000;

// Coalesce concurrent fetchLavaUsdPrice() callers on a cache miss so
// multiple routes starting in parallel share a single CoinGecko request.
let pendingLavaPrice: Promise<number> | null = null;

export async function fetchLavaUsdPrice(): Promise<number> {
  const cached = priceCache.get("lava");
  if (cached && Date.now() - cached.ts < PRICE_CACHE_MS) return cached.price;
  if (pendingLavaPrice) return pendingLavaPrice;

  pendingLavaPrice = (async () => {
    const res = await coingeckoFetch(
      `${config.external.coingeckoApiUrl}/simple/price?ids=lava-network&vs_currencies=usd`,
    );
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const data = (await res.json()) as { "lava-network"?: { usd?: number } };
    const price = data["lava-network"]?.usd;
    if (!price || price <= 0) throw new Error("Invalid LAVA price from CoinGecko");
    priceCache.set("lava", { price, ts: Date.now() });
    return price;
  })().finally(() => { pendingLavaPrice = null; });

  return pendingLavaPrice;
}

/** Denom → base unit conversion (matching jsinfo DENOM_CONVERSIONS) */
export const DENOM_CONVERSIONS: Record<string, { baseDenom: string; factor: number }> = {
  ulava:       { baseDenom: "lava",  factor: 1_000_000 },
  uatom:       { baseDenom: "atom",  factor: 1_000_000 },
  uosmo:       { baseDenom: "osmo",  factor: 1_000_000 },
  ujuno:       { baseDenom: "juno",  factor: 1_000_000 },
  ustars:      { baseDenom: "stars", factor: 1_000_000 },
  uakt:        { baseDenom: "akt",   factor: 1_000_000 },
  uhuahua:     { baseDenom: "huahua", factor: 1_000_000 },
  uevmos:      { baseDenom: "evmos", factor: 1e18 },
  inj:         { baseDenom: "inj",   factor: 1e18 },
  aevmos:      { baseDenom: "evmos", factor: 1e18 },
  basecro:     { baseDenom: "cro",   factor: 1e8 },
  uscrt:       { baseDenom: "scrt",  factor: 1_000_000 },
  uiris:       { baseDenom: "iris",  factor: 1_000_000 },
  uregen:      { baseDenom: "regen", factor: 1_000_000 },
  uion:        { baseDenom: "ion",   factor: 1_000_000 },
  nanolike:    { baseDenom: "like",  factor: 1e9 },
  uaxl:        { baseDenom: "axl",   factor: 1_000_000 },
  uband:       { baseDenom: "band",  factor: 1_000_000 },
  ubld:        { baseDenom: "bld",   factor: 1_000_000 },
  ucmdx:       { baseDenom: "cmdx",  factor: 1_000_000 },
  ucre:        { baseDenom: "cre",   factor: 1_000_000 },
  uxprt:       { baseDenom: "xprt",  factor: 1_000_000 },
  uusdc:       { baseDenom: "usdc",  factor: 1_000_000 },
  "unit-move": { baseDenom: "move",  factor: 1e7 },
};

/** Base denom → CoinGecko coin ID */
export const DENOM_COINGECKO_ID: Record<string, string> = {
  lava: "lava-network", atom: "cosmos", osmo: "osmosis",
  juno: "juno-network", stars: "stargaze", akt: "akash-network",
  huahua: "chihuahua-token", evmos: "evmos", inj: "injective-protocol",
  cro: "crypto-com-chain", scrt: "secret", iris: "iris-network",
  regen: "regen", ion: "ion", like: "likecoin", axl: "axelar",
  band: "band-protocol", bld: "agoric", cmdx: "comdex",
  cre: "crescent-network", xprt: "persistence", usdc: "usd-coin",
  move: "movement",
};

/**
 * Pre-warm the price cache with a single batch CoinGecko call for all known denoms.
 * CoinGecko supports comma-separated IDs in one request.
 */
export async function prewarmPriceCache(): Promise<void> {
  const now = Date.now();
  // Skip if all entries are still fresh
  const allFresh = Object.keys(DENOM_COINGECKO_ID).every((d) => {
    const c = priceCache.get(d);
    return c && now - c.ts < PRICE_CACHE_MS;
  });
  if (allFresh) return;

  const ids = [...new Set(Object.values(DENOM_COINGECKO_ID))].join(",");
  try {
    const res = await fetch(
      `${config.external.coingeckoApiUrl}/simple/price?ids=${ids}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return;
    const data = (await res.json()) as Record<string, { usd?: number }>;
    const ts = Date.now();
    for (const [denom, cgId] of Object.entries(DENOM_COINGECKO_ID)) {
      const price = data[cgId]?.usd ?? 0;
      if (price > 0) priceCache.set(denom, { price, ts });
    }
  } catch {
    // Keep stale cache on failure
  }
}

// ── Historical pricing (CoinGecko /coins/{id}/history) ──────────────────────
// Used for rewards snapshots at historical block heights — we want the LAVA
// price as it was on that date, not the current price. Results are cached by
// (denom, date) tuple indefinitely since historical prices don't change.

interface HistoricalPriceKey { baseDenom: string; date: string /* YYYY-MM-DD */ }
const historicalPriceCache = new Map<string, number>();
const keyStr = (k: HistoricalPriceKey) => `${k.baseDenom}@${k.date}`;

// Format a Date to CoinGecko's expected `DD-MM-YYYY` string.
function formatDateForCoingecko(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/** Fetch USD price for a single base denom on a specific date.
 *
 *  Returns 0 ONLY for legitimate "no data" cases:
 *   - denom isn't in our CoinGecko map
 *   - CoinGecko returns 404 (coin ID not found)
 *   - CoinGecko returns 200 with no market_data for that date
 *
 *  THROWS on transient failures (rate limit after retries, network error).
 *  Critical: historical responses are cached for a year — silently returning 0
 *  (then falling back to current price) would bake wrong USD into the cache.
 *  Better to 503 and let the next caller retry from scratch.
 *
 *  Zeros are cached (negative-result caching) because "coin not listed" and
 *  "no data on that date" are permanent. Transient errors don't cache. */
export async function fetchTokenUsdPriceAt(
  baseDenom: string,
  date: Date,
): Promise<number> {
  const isoDate = date.toISOString().slice(0, 10);
  const k = keyStr({ baseDenom, date: isoDate });
  const cached = historicalPriceCache.get(k);
  if (cached !== undefined) return cached;

  const id = DENOM_COINGECKO_ID[baseDenom];
  if (!id) {
    historicalPriceCache.set(k, 0);
    return 0;
  }

  const res = await coingeckoFetch(
    `${config.external.coingeckoApiUrl}/coins/${id}/history?date=${formatDateForCoingecko(date)}&localization=false`,
  );
  if (res.status === 404) {
    historicalPriceCache.set(k, 0);
    return 0;
  }
  if (!res.ok) {
    throw new Error(`CoinGecko ${res.status} for ${baseDenom} @ ${isoDate}`);
  }
  const data = (await res.json()) as {
    market_data?: { current_price?: { usd?: number } };
  };
  const price = data.market_data?.current_price?.usd ?? 0;
  historicalPriceCache.set(k, price);
  return price;
}

/** Build a `baseDenom → price` map at a given date.
 *
 *  Pass `denoms` to limit which prices to fetch — the route typically passes
 *  only the denoms that actually appear in the block's rewards (usually just
 *  LAVA + 0-2 IBC denoms). Without this, fetching all 22 known denoms
 *  sequentially with retry backoff would exceed the gateway timeout under any
 *  CoinGecko throttling.
 *
 *  Sequential (not parallel) because free-tier rate limiting on 22+ concurrent
 *  calls causes silent drop-to-current-price. Results cache indefinitely so
 *  the sequential cost is paid once per (denom, date) tuple.
 *
 *  LAVA goes first so we get the critical price even if later denoms throttle.
 *  LAVA failure propagates (caller needs to know). Other denoms best-effort —
 *  on failure they're logged and skipped, downstream falls back to current
 *  price for those (negligible drift since rewards are 99%+ LAVA). */
export async function buildHistoricalPriceMap(
  date: Date,
  denoms: string[] = Object.keys(DENOM_COINGECKO_ID),
): Promise<Record<string, number>> {
  const orderedDenoms = denoms.includes("lava")
    ? ["lava", ...denoms.filter((d) => d !== "lava")]
    : denoms;

  const out: Record<string, number> = {};
  for (const d of orderedDenoms) {
    try {
      const p = await fetchTokenUsdPriceAt(d, date);
      if (p > 0) out[d] = p;
    } catch (e) {
      if (d === "lava") throw e; // LAVA is required; bubble to 503
      logger.warn({ denom: d, date: date.toISOString(), err: String(e) },
        "historical price unavailable, continuing without it");
    }
  }
  return out;
}

/** Fetch USD price for a base denom — reads from cache (pre-warmed by prewarmPriceCache) */
export async function fetchTokenUsdPrice(baseDenom: string): Promise<number> {
  const cached = priceCache.get(baseDenom);
  if (cached && Date.now() - cached.ts < PRICE_CACHE_MS) return cached.price;

  // Fallback: single-denom fetch if cache miss (shouldn't happen after prewarm)
  const id = DENOM_COINGECKO_ID[baseDenom];
  if (!id) return 0;

  try {
    const res = await fetch(
      `${config.external.coingeckoApiUrl}/simple/price?ids=${id}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return cached?.price ?? 0;
    const data = (await res.json()) as Record<string, { usd?: number }>;
    const price = data[id]?.usd ?? 0;
    if (price > 0) priceCache.set(baseDenom, { price, ts: Date.now() });
    return price;
  } catch {
    return cached?.price ?? 0;
  }
}

// IBC hash → base denom is immutable once the channel is established. Cache
// forever so we don't keep hitting chain RPC on every reward-processing pass.
const ibcTraceCache = new Map<string, string | null>();

/** Resolve an IBC hash to its base denom via chain RPC */
export async function fetchDenomTrace(ibcHash: string): Promise<string | null> {
  const cached = ibcTraceCache.get(ibcHash);
  if (cached !== undefined) return cached;
  try {
    const data = await fetchRest<{
      denom_trace: { base_denom: string };
    }>(`/ibc/apps/transfer/v1/denom_traces/${ibcHash}`);
    const resolved = data.denom_trace?.base_denom ?? null;
    ibcTraceCache.set(ibcHash, resolved);
    return resolved;
  } catch {
    // Don't cache transient failures — next caller retries.
    return null;
  }
}

// ── TVL computation (jsinfo-shape) ───────────────────────────────────────────

// Reward pools that count toward TVL (iprpc_pool excluded)
const TVL_REWARD_POOLS = [
  "validators_rewards_distribution_pool",
  "validators_rewards_allocation_pool",
  "providers_rewards_distribution_pool",
  "providers_rewards_allocation_pool",
];

async function fetchTvlRewardPoolsUlava(): Promise<bigint> {
  const data = await fetchRest<{
    pools: Array<{ name: string; balance: Array<{ denom: string; amount: string }> }>;
  }>("/lavanet/lava/rewards/pools");
  let total = 0n;
  for (const pool of data.pools ?? []) {
    if (TVL_REWARD_POOLS.includes(pool.name)) {
      for (const coin of pool.balance ?? []) {
        if (coin.denom === "ulava") total += BigInt(coin.amount);
      }
    }
  }
  return total;
}

async function fetchSubscriptionCreditsUlava(): Promise<bigint> {
  try {
    const data = await fetchRest<{
      subs_info: Array<{ credit: { amount: string; denom: string } }>;
    }>("/lavanet/lava/subscription/list");
    let total = 0n;
    for (const sub of data.subs_info ?? []) {
      if (sub.credit?.denom === "ulava") {
        const amount = BigInt(sub.credit.amount || "0");
        if (amount > 0n) total += amount;
      }
    }
    return total;
  } catch {
    return 0n;
  }
}

async function fetchOsmosisLavaUlava(): Promise<bigint> {
  try {
    const input = JSON.stringify({
      json: {
        limit: 10, search: null, denoms: ["LAVA"],
        types: ["weighted", "stable", "concentrated", "cosmwasm-transmuter",
                "cosmwasm", "cosmwasm-astroport-pcl", "cosmwasm-whitewhale"],
        incentiveTypes: ["superfluid", "osmosis", "boost", "none"],
        sort: { keyPath: "market.volume24hUsd", direction: "desc" },
        minLiquidityUsd: 1000, cursor: 0,
      },
      meta: { values: { search: ["undefined"] } },
    });
    const res = await fetch(
      `https://app.osmosis.zone/api/edge-trpc-pools/pools.getPools?input=${encodeURIComponent(input)}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return 0n;
    const data = (await res.json()) as {
      result: { data: { json: { items: Array<{
        reserveCoins: Array<{ currency: { coinDenom: string }; amount: string }>;
      }> } } };
    };
    let total = 0n;
    for (const pool of data.result?.data?.json?.items ?? []) {
      for (const coin of pool.reserveCoins ?? []) {
        if (coin.currency?.coinDenom?.toLowerCase() === "lava") {
          total += BigInt(Math.round(parseFloat(coin.amount || "0")));
        }
      }
    }
    return total;
  } catch {
    return 0n;
  }
}

async function fetchBaseDexUsd(): Promise<number> {
  try {
    const res = await fetch(
      "https://api.geckoterminal.com/api/v2/search/pools?query=lava",
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) return 0;
    const data = (await res.json()) as {
      data: Array<{ id: string; attributes: { reserve_in_usd: string } }>;
    };
    const basePool = data.data?.find((p: { id: string }) => p.id.startsWith("base_"));
    return basePool ? parseFloat(basePool.attributes.reserve_in_usd || "0") : 0;
  } catch {
    return 0;
  }
}

async function fetchArbitrumDexUsd(): Promise<number> {
  try {
    const res = await fetch("https://interface.gateway.uniswap.org/v1/graphql", {
      method: "POST",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "Content-Type": "application/json",
        Origin: "https://app.uniswap.org",
      },
      body: JSON.stringify({
        query: `query($chain: Chain!, $address: String) {
          token(chain: $chain, address: $address) {
            market(currency: USD) { totalValueLocked { value } }
          }
        }`,
        variables: {
          address: "0x11e969e9b3f89cb16d686a03cd8508c9fc0361af",
          chain: "ARBITRUM",
        },
      }),
    });
    if (!res.ok) return 0;
    const data = (await res.json()) as {
      data?: { token?: { market?: { totalValueLocked?: { value?: number } } } };
    };
    return data.data?.token?.market?.totalValueLocked?.value ?? 0;
  } catch {
    return 0;
  }
}

/**
 * TVL (USD) = bonded tokens + 4 reward pools + subscriptions + DEX liquidity
 * Matches jsinfo formula: all components converted to USD via CoinGecko LAVA price.
 */
export async function computeTVL(): Promise<{ tvl: string }> {
  const [lavaPrice, pool, rewardPools, subscriptions, osmosis, baseUsd, arbitrumUsd] =
    await Promise.all([
      fetchLavaUsdPrice(),
      fetchStakingPool(),
      fetchTvlRewardPoolsUlava(),
      fetchSubscriptionCreditsUlava(),
      fetchOsmosisLavaUlava(),
      fetchBaseDexUsd(),
      fetchArbitrumDexUsd(),
    ]);

  const bondedTokens = BigInt(pool.bonded_tokens);

  // Convert DEX USD values to ulava to match jsinfo round-trip
  const baseUlava = lavaPrice > 0
    ? BigInt(Math.round((baseUsd / lavaPrice) * 1_000_000))
    : 0n;
  const arbitrumUlava = lavaPrice > 0
    ? BigInt(Math.round((arbitrumUsd / lavaPrice) * 1_000_000))
    : 0n;

  // Sum all components in ulava, then convert to USD via shared helper
  // (full precision: integer-divide + remainder, avoiding Number overflow)
  const totalUlava = bondedTokens + rewardPools + subscriptions
    + osmosis + baseUlava + arbitrumUlava;
  const tvlUsd = ulavaToLavaNumber(totalUlava) * lavaPrice;

  return { tvl: tvlUsd.toFixed(4) };
}
