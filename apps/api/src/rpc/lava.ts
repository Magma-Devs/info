import pino from "pino";
import type { Redis } from "ioredis";

const logger = pino({ name: "rpc" });

const LAVA_REST_URL = process.env.LAVA_REST_URL ?? "https://lava.rest.lava.build";

// Request coalescing: concurrent fetches for the same path share one in-flight request
const inflightRpc = new Map<string, Promise<unknown>>();

async function fetchRest<T>(path: string, blockHeight?: number): Promise<T> {
  const cacheKey = blockHeight ? `${path}@${blockHeight}` : path;
  const existing = inflightRpc.get(cacheKey);
  if (existing) return existing as Promise<T>;

  const promise = (async () => {
    const headers: Record<string, string> = {};
    if (blockHeight) headers["x-cosmos-block-height"] = String(blockHeight);

    const res = await fetch(`${LAVA_REST_URL}${path}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`RPC ${res.status}: ${res.statusText}`);
    return (await res.json()) as T;
  })();

  inflightRpc.set(cacheKey, promise);
  const cleanup = () => { inflightRpc.delete(cacheKey); };
  promise.then(cleanup, cleanup);
  return promise;
}

export async function fetchTotalSupply(blockHeight?: number): Promise<bigint> {
  const data = await fetchRest<{ supply: Array<{ denom: string; amount: string }> }>(
    "/cosmos/bank/v1beta1/supply",
    blockHeight,
  );
  const lava = data.supply?.find((c) => c.denom === "ulava");
  return BigInt(lava?.amount ?? "0");
}

// Lava mainnet genesis timestamp (block 1) — used to narrow binary search range.
const LAVA_GENESIS_UNIX = 1_713_350_000; // ~2024-04-17

// LRU-ish cache for timestamp → block height (avoids repeated binary searches).
const blockAtTsCache = new Map<number, number>();
const BLOCK_AT_TS_CACHE_MAX = 200;

// Binary-search Tendermint blocks to find the block closest to a target unix timestamp.
// Uses linear interpolation to estimate the starting range, reducing iterations from ~23 to ~10.
export async function fetchBlockAtTimestamp(targetUnix: number): Promise<number> {
  const cached = blockAtTsCache.get(targetUnix);
  if (cached !== undefined) return cached;

  const LAVA_RPC_URL = process.env.LAVA_RPC_URL ?? "https://lava.tendermintrpc.lava.build:443";

  async function blockTime(height: number): Promise<number> {
    const res = await fetch(`${LAVA_RPC_URL}/block?height=${height}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`RPC ${res.status}`);
    const data = (await res.json()) as {
      result: { block: { header: { time: string } } };
    };
    return Math.floor(new Date(data.result.block.header.time).getTime() / 1000);
  }

  const { height: latestHeight, time: latestTime } = await fetchLatestBlockHeight();
  const latestUnix = Math.floor(new Date(latestTime).getTime() / 1000);

  if (targetUnix >= latestUnix) return latestHeight;

  // Linear interpolation to narrow the search range
  const genesisUnix = LAVA_GENESIS_UNIX;
  const estimatedHeight = Math.max(1, Math.min(
    latestHeight,
    Math.floor(latestHeight * (targetUnix - genesisUnix) / (latestUnix - genesisUnix)),
  ));
  const margin = 2000;
  let lo = Math.max(1, estimatedHeight - margin);
  let hi = Math.min(latestHeight, estimatedHeight + margin);

  // Verify bounds contain the target; widen if not
  if (await blockTime(lo) > targetUnix) lo = 1;
  if (await blockTime(hi) < targetUnix) hi = latestHeight;

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const t = await blockTime(mid);
    if (t < targetUnix) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  // Evict oldest entry if cache is full
  if (blockAtTsCache.size >= BLOCK_AT_TS_CACHE_MAX) {
    const firstKey = blockAtTsCache.keys().next().value;
    if (firstKey !== undefined) blockAtTsCache.delete(firstKey);
  }
  blockAtTsCache.set(targetUnix, lo);

  return lo;
}

const REWARD_POOLS = [
  "validators_rewards_distribution_pool",
  "validators_rewards_allocation_pool",
  "providers_rewards_distribution_pool",
  "providers_rewards_allocation_pool",
  "iprpc_pool",
];

async function fetchRewardPoolsAmount(): Promise<bigint> {
  const data = await fetchRest<{
    pools: Array<{ name: string; balance: Array<{ denom: string; amount: string }> }>;
  }>("/lavanet/lava/rewards/pools");

  let total = 0n;
  for (const pool of data.pools ?? []) {
    if (REWARD_POOLS.includes(pool.name)) {
      for (const coin of pool.balance ?? []) {
        if (coin.denom === "ulava") total += BigInt(coin.amount);
      }
    }
  }
  return total;
}

const PROVIDER_REWARD_POOLS = [
  "providers_rewards_distribution_pool",
  "providers_rewards_allocation_pool",
  "iprpc_pool",
];

/** Fetch total ulava in provider-side reward pools (excludes validator pools). */
export async function fetchProviderRewardPoolsAmount(): Promise<bigint> {
  const data = await fetchRest<{
    pools: Array<{ name: string; balance: Array<{ denom: string; amount: string }> }>;
  }>("/lavanet/lava/rewards/pools");

  let total = 0n;
  for (const pool of data.pools ?? []) {
    if (PROVIDER_REWARD_POOLS.includes(pool.name)) {
      for (const coin of pool.balance ?? []) {
        if (coin.denom === "ulava") total += BigInt(coin.amount);
      }
    }
  }
  return total;
}

interface VestingStats {
  continuousVesting: bigint;
  periodicVesting: bigint;
}

async function fetchLockedVestingTokens(): Promise<VestingStats> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const stats: VestingStats = { continuousVesting: 0n, periodicVesting: 0n };
  let nextKey: string | null = null;

  do {
    const params = new URLSearchParams({ "pagination.limit": "1000" });
    if (nextKey) params.set("pagination.key", nextKey);

    const data = await fetchRest<{
      accounts: Array<{
        "@type": string;
        start_time?: string;
        base_vesting_account?: {
          original_vesting?: Array<{ denom: string; amount: string }>;
          end_time?: string;
        };
        vesting_periods?: Array<{
          length: string;
          amount: Array<{ denom: string; amount: string }>;
        }>;
      }>;
      pagination?: { next_key: string | null };
    }>(`/cosmos/auth/v1beta1/accounts?${params}`);

    for (const account of data.accounts ?? []) {
      const type = account["@type"];

      if (type === "/cosmos.vesting.v1beta1.ContinuousVestingAccount") {
        const totalAmount = BigInt(
          account.base_vesting_account?.original_vesting?.[0]?.amount ?? "0",
        );
        const startTime = BigInt(account.start_time ?? "0");
        const endTime = BigInt(account.base_vesting_account?.end_time ?? "0");
        const now = BigInt(nowSeconds);

        if (now < startTime) {
          stats.continuousVesting += totalAmount;
        } else if (now < endTime && endTime > startTime) {
          stats.continuousVesting += ((endTime - now) * totalAmount) / (endTime - startTime);
        }
      } else if (type === "/cosmos.vesting.v1beta1.PeriodicVestingAccount") {
        let currentTime = parseInt(account.start_time ?? "0");
        for (const period of account.vesting_periods ?? []) {
          currentTime += parseInt(period.length);
          if (currentTime >= nowSeconds) {
            stats.periodicVesting += BigInt(period.amount?.[0]?.amount ?? "0");
          }
        }
      }
    }

    nextKey = data.pagination?.next_key ?? null;
  } while (nextKey);

  return stats;
}

export async function fetchCirculatingSupply(): Promise<bigint> {
  const [totalSupply, pools, vesting] = await Promise.all([
    fetchTotalSupply(),
    fetchRewardPoolsAmount(),
    fetchLockedVestingTokens(),
  ]);

  const circulating = totalSupply - vesting.continuousVesting - vesting.periodicVesting - pools;
  if (circulating < 0n) {
    logger.warn(
      `Negative circulating supply: total=${totalSupply} continuous=${vesting.continuousVesting} periodic=${vesting.periodicVesting} pools=${pools}`,
    );
    return 0n;
  }
  return circulating;
}

export interface ProviderEndpoint {
  iPPORT: string;
  geolocation: number;
  apiInterfaces: string[];
  addons: string[];
  extensions: string[];
}

export interface ProviderForSpec {
  address: string;
  moniker: string;
  identity: string;
  stake: { amount: string };
  delegate_total: { amount: string };
  delegate_commission: string;
  geolocation: number;
  addons: string;
  extensions: string;
  apiInterfaces: string;
  endpoints: ProviderEndpoint[];
}

export async function fetchProvidersForSpec(specId: string): Promise<ProviderForSpec[]> {
  const data = await fetchRest<{
    stakeEntry: Array<{
      address: string;
      moniker: string;
      description?: { identity?: string };
      stake: { amount: string };
      delegate_total: { amount: string };
      delegate_commission: string;
      geolocation: number;
      endpoints?: Array<{
        iPPORT?: string;
        geolocation?: number;
        addons?: string[];
        extensions?: string[];
        api_interfaces?: string[];
      }>;
    }>;
  }>(`/lavanet/lava/pairing/providers/${specId}`);

  return (data.stakeEntry ?? []).map((entry) => {
    const allAddons = new Set<string>();
    const allExtensions = new Set<string>();
    const allApiInterfaces = new Set<string>();
    const endpoints: ProviderEndpoint[] = [];

    for (const ep of entry.endpoints ?? []) {
      for (const a of ep.addons ?? []) if (a) allAddons.add(a);
      for (const e of ep.extensions ?? []) if (e) allExtensions.add(e);
      for (const i of ep.api_interfaces ?? []) if (i) allApiInterfaces.add(i);

      if (ep.iPPORT) {
        endpoints.push({
          iPPORT: ep.iPPORT,
          geolocation: ep.geolocation ?? entry.geolocation,
          apiInterfaces: (ep.api_interfaces ?? []).filter(Boolean),
          addons: (ep.addons ?? []).filter(Boolean),
          extensions: (ep.extensions ?? []).filter(Boolean),
        });
      }
    }

    return {
      address: entry.address,
      moniker: entry.moniker,
      identity: entry.description?.identity ?? "",
      stake: entry.stake,
      delegate_total: entry.delegate_total,
      delegate_commission: entry.delegate_commission,
      geolocation: entry.geolocation,
      addons: Array.from(allAddons).join(","),
      extensions: Array.from(allExtensions).join(","),
      apiInterfaces: Array.from(allApiInterfaces).join(","),
      endpoints,
    };
  });
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Display name overrides — keys are specIDs (uppercase) */
const CHAIN_DISPLAY_NAMES: Record<string, string> = {
  BSC: "BNB Chain Mainnet",
  BSCT: "BNB Chain Testnet",
  COSMOSHUB: "Cosmos Hub Mainnet",
  COSMOSHUBT: "Cosmos Hub Testnet",
  ETH1: "Ethereum Mainnet",
  FTM4002: "Fantom Testnet",
  FVMT: "Filecoin Testnet",
  HEDERA: "Hedera Hashgraph Mainnet",
  BTC: "Bitcoin Mainnet",
  HOL1: "Ethereum Holesky Testnet",
  LAVA: "Lava Mainnet",
  LAV1: "Lava Testnet",
  MOVEMENTT: "Movement Testnet",
  OPTMS: "Optimism Sepolia Testnet",
  POLYGONA: "Polygon Amoy Testnet",
  SEP1: "Ethereum Sepolia Testnet",
  SOLANAT: "Solana Testnet",
  SONICT: "Sonic Blaze Testnet",
  SPARK: "Fuse Testnet",
  STRKS: "Starknet Sepolia Testnet",
  TRX: "Tron Mainnet",
  TRXT: "Tron Shasta Testnet",
};

function chainDisplayName(chainID: string, chainName: string): string {
  if (CHAIN_DISPLAY_NAMES[chainID]) return CHAIN_DISPLAY_NAMES[chainID];
  return titleCase(chainName);
}

/** Base specs that aren't real chains — excluded from all chain lists */
const BASE_SPECS = new Set([
  "SUIGRPC", "SUIJSONRPC",
  "COSMOSSDK", "COSMOSSDK50", "COSMOSWASM",
  "ETHERMINT", "TENDERMINT", "IBC",
]);

export async function fetchAllSpecs(): Promise<Array<{ index: string; name: string }>> {
  const data = await fetchRest<{
    chainInfoList: Array<{ chainName: string; chainID: string }>;
  }>("/lavanet/lava/spec/show_all_chains");
  return (data.chainInfoList ?? [])
    .filter((c) => !BASE_SPECS.has(c.chainID))
    .map((c) => ({ index: c.chainID, name: chainDisplayName(c.chainID, c.chainName) }));
}

export async function fetchStakingPool(): Promise<{ bonded_tokens: string; not_bonded_tokens: string }> {
  const data = await fetchRest<{ pool: { bonded_tokens: string; not_bonded_tokens: string } }>(
    "/cosmos/staking/v1beta1/pool",
  );
  return data.pool;
}


// Reward pools that count toward TVL (iprpc_pool excluded)
const TVL_REWARD_POOLS = [
  "validators_rewards_distribution_pool",
  "validators_rewards_allocation_pool",
  "providers_rewards_distribution_pool",
  "providers_rewards_allocation_pool",
];

const COINGECKO_API_URL = process.env.COINGECKO_API_URL ?? "https://api.coingecko.com/api/v3";

export async function fetchLavaUsdPrice(): Promise<number> {
  const res = await fetch(
    `${COINGECKO_API_URL}/simple/price?ids=lava-network&vs_currencies=usd`,
  );
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const data = (await res.json()) as { "lava-network"?: { usd?: number } };
  const price = data["lava-network"]?.usd;
  if (!price || price <= 0) throw new Error("Invalid LAVA price from CoinGecko");
  return price;
}

// Fetch LAVA USD price at a specific date via CoinGecko /coins/{id}/history.
// date is a Date object; CoinGecko expects dd-mm-yyyy format.
export async function fetchLavaUsdPriceAt(date: Date): Promise<number> {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  const res = await fetch(
    `${COINGECKO_API_URL}/coins/lava-network/history?date=${dd}-${mm}-${yyyy}&localization=false`,
    { signal: AbortSignal.timeout(15_000) },
  );
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const data = (await res.json()) as {
    market_data?: { current_price?: { usd?: number } };
  };
  const price = data.market_data?.current_price?.usd;
  if (!price || price <= 0) throw new Error(`No LAVA price for ${yyyy}-${mm}-${dd}`);
  return price;
}

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

  // Sum all components in ulava, then convert to USD
  // Use BigInt division to avoid Number precision loss for large ulava sums
  const totalUlava = bondedTokens + rewardPools + subscriptions
    + osmosis + baseUlava + arbitrumUlava;
  const totalLava = Number(totalUlava / 1_000_000n) + Number(totalUlava % 1_000_000n) / 1_000_000;
  const tvlUsd = totalLava * lavaPrice;

  return { tvl: tvlUsd.toFixed(4) };
}

// --- APR calculation (matches jsinfo) ---

/** Benchmark: 10,000 LAVA in ulava / base units */
const APR_BENCHMARK_ULAVA = 10_000_000_000;
const APR_BENCHMARK_LAVA = 10_000;
const APR_BENCHMARK_DENOM = "ulava";
/** 80th percentile, capped at 30% — same thresholds as jsinfo */
const APR_PERCENTILE = 0.8;
const APR_MAX_PERCENTILE_CAP = 0.3;
const APR_MAX_INDIVIDUAL = 0.8;
const APR_MIN = 1e-11;

/** Denom → base unit conversion (matching jsinfo DENOM_CONVERSIONS) */
const DENOM_CONVERSIONS: Record<string, { baseDenom: string; factor: number }> = {
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
const DENOM_COINGECKO_ID: Record<string, string> = {
  lava: "lava-network", atom: "cosmos", osmo: "osmosis",
  juno: "juno-network", stars: "stargaze", akt: "akash-network",
  huahua: "chihuahua-token", evmos: "evmos", inj: "injective-protocol",
  cro: "crypto-com-chain", scrt: "secret", iris: "iris-network",
  regen: "regen", ion: "ion", like: "likecoin", axl: "axelar",
  band: "band-protocol", bld: "agoric", cmdx: "comdex",
  cre: "crescent-network", xprt: "persistence", usdc: "usd-coin",
  move: "movement",
};

/** In-memory price cache (5 min TTL) */
const priceCache = new Map<string, { price: number; ts: number }>();
const PRICE_CACHE_MS = 300_000;

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
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
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

/** Fetch USD price for a base denom — reads from cache (pre-warmed by prewarmPriceCache) */
async function fetchTokenUsdPrice(baseDenom: string): Promise<number> {
  const cached = priceCache.get(baseDenom);
  if (cached && Date.now() - cached.ts < PRICE_CACHE_MS) return cached.price;

  // Fallback: single-denom fetch if cache miss (shouldn't happen after prewarm)
  const id = DENOM_COINGECKO_ID[baseDenom];
  if (!id) return 0;

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
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

/** Resolve an IBC hash to its base denom via chain RPC */
async function fetchDenomTrace(ibcHash: string): Promise<string | null> {
  try {
    const data = await fetchRest<{
      denom_trace: { base_denom: string };
    }>(`/ibc/apps/transfer/v1/denom_traces/${ibcHash}`);
    return data.denom_trace?.base_denom ?? null;
  } catch {
    return null;
  }
}

interface EstimatedRewardsResponse {
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
  const [whole, frac] = s.split(".");
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
async function fetchEstimatedRewards(
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

/**
 * Fetch a provider's actual earned rewards (no benchmark amount) and group by spec.
 * Matches jsinfo's rewards_last_month: calls estimated_provider_rewards/{addr}/
 * then splits "Boost: ETH1", "Pools: ETH1", "Subscription: ETH1" into per-spec groups.
 */
export async function fetchRewardsBySpec(
  address: string,
  specNameMap: Map<string, string>,
): Promise<RewardsBySpecEntry[]> {
  try {
    const data = await fetchRest<EstimatedRewardsResponse>(
      `/lavanet/lava/subscription/estimated_provider_rewards/${address}/`,
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

/** Fetch all bonded validator operator addresses */
export async function fetchBondedValidators(): Promise<string[]> {
  const validators: string[] = [];
  let nextKey: string | null = null;
  do {
    const params = new URLSearchParams({
      status: "BOND_STATUS_BONDED",
      "pagination.limit": "200",
    });
    if (nextKey) params.set("pagination.key", nextKey);
    const data = await fetchRest<{
      validators: Array<{ operator_address: string }>;
      pagination: { next_key: string | null };
    }>(`/cosmos/staking/v1beta1/validators?${params}`);
    for (const v of data.validators ?? []) validators.push(v.operator_address);
    nextKey = data.pagination?.next_key ?? null;
  } while (nextKey);
  return validators;
}

/** Percentile calculation matching jsinfo `CalculatePercentile` */
function calculatePercentile(values: number[], rank: number): number {
  if (values.length === 0 || rank < 0 || rank > 1) return 0;
  if (values.length === 1) return values[0];

  const sorted = [...values].sort((a, b) => a - b);
  const pos = Math.floor((sorted.length - 1) * rank);

  if (sorted.length % 2 === 0) {
    return sorted[pos] + (sorted[pos + 1] - sorted[pos]) * rank;
  }
  return sorted[pos];
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
      const avg = history.records[i].aprSum / history.records[i].count;
      weightedSum += avg * APR_WEIGHTS[i];
      weightSum += APR_WEIGHTS[i];
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

  // Collect per-entity APRs (batches of 5 to respect RPC rate limits)
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

  for (let i = 0; i < addresses.length; i += 5) {
    const batch = addresses.slice(i, i + 5);
    const rewards = await Promise.all(
      batch.map((addr) => fetchEstimatedRewards(type, addr)),
    );

    for (let j = 0; j < batch.length; j++) {
      const currentApr = calculateApr(rewards[j].totalUsd, investedUsd);
      if (currentApr <= 0) continue;

      let finalApr = currentApr;
      if (redis) {
        await storeApr(redis, type, batch[j], currentApr);
        const weighted = await getWeightedApr(redis, type, batch[j]);
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

interface ProviderSpecEntry {
  chain: string;
  spec: string;
  stakestatus: string;
  stake: string;
  addons: string;
  extensions: string;
  delegateCommission: string;
  delegateTotal: string;
  moniker: string;
}

export interface RewardsBySpecEntry {
  chain: string;
  spec: string;
  tokens: RewardToken[];
  total_usd: number;
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

/** Build per-provider spec data + address list + spec name map from chain RPC */
export async function fetchProvidersWithSpecs(): Promise<{
  providers: Map<string, { moniker: string; identity: string; commission: string; specs: ProviderSpecEntry[] }>;
  specNames: Map<string, string>;
}> {
  const allSpecs = await fetchAllSpecs();
  const specNames = new Map(allSpecs.map((s) => [s.index, s.name]));
  const byAddress = new Map<
    string,
    { moniker: string; identity: string; commission: string; specs: ProviderSpecEntry[] }
  >();

  for (let i = 0; i < allSpecs.length; i += 5) {
    const batch = allSpecs.slice(i, i + 5);
    const results = await Promise.all(
      batch.map((s) => fetchProvidersForSpec(s.index)
        .then((ps) => ps.map((p) => ({ ...p, specId: s.index, specName: s.name })))
        .catch(() => [] as Array<ProviderForSpec & { specId: string; specName: string }>)),
    );

    for (const providers of results) {
      for (const p of providers) {
        const existing = byAddress.get(p.address);
        const specEntry: ProviderSpecEntry = {
          chain: p.specName,
          spec: p.specId,
          stakestatus: "Active",
          stake: p.stake?.amount ?? "0",
          addons: p.addons,
          extensions: p.extensions,
          delegateCommission: p.delegate_commission,
          delegateTotal: p.delegate_total?.amount ?? "0",
          moniker: p.moniker,
        };

        if (existing) {
          existing.specs.push(specEntry);
          if (!existing.commission && p.delegate_commission) existing.commission = p.delegate_commission;
          if (!existing.identity && p.identity) existing.identity = p.identity;
        } else {
          byAddress.set(p.address, {
            moniker: p.moniker ?? "",
            identity: p.identity ?? "",
            commission: p.delegate_commission ?? "",
            specs: [specEntry],
          });
        }
      }
    }
  }

  return { providers: byAddress, specNames };
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

  for (let i = 0; i < addresses.length; i += 5) {
    const batch = addresses.slice(i, i + 5);
    const [rewardResults, rewardsLastMonthResults, avatarResults] = await Promise.all([
      Promise.all(batch.map((addr) => fetchEstimatedRewards("provider", addr))),
      Promise.all(batch.map((addr) => fetchRewardsBySpec(addr, specNames))),
      Promise.all(batch.map((addr) => {
        const p = providerMap.get(addr)!;
        return fetchProviderAvatar(addr, p.identity || undefined).catch(() => null);
      })),
    ]);

    for (let j = 0; j < batch.length; j++) {
      const addr = batch[j];
      const provider = providerMap.get(addr)!;
      const rewards = rewardResults[j];
      const rewardsLastMonth = rewardsLastMonthResults[j];
      const avatar = avatarResults[j];
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

export async function fetchLatestBlockHeight(): Promise<{
  height: number;
  time: string;
}> {
  const LAVA_RPC_URL = process.env.LAVA_RPC_URL ?? "https://lava.tendermintrpc.lava.build:443";
  const res = await fetch(`${LAVA_RPC_URL}/status`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const data = (await res.json()) as {
    result: { sync_info: { latest_block_height: string; latest_block_time: string } };
  };
  return {
    height: parseInt(data.result.sync_info.latest_block_height, 10),
    time: data.result.sync_info.latest_block_time,
  };
}

// Request coalescing: concurrent callers share one in-flight fetchAllProviders
let pendingProviders: Promise<AllProvidersResult> | null = null;

type AllProvidersResult = Array<{
  address: string;
  moniker: string;
  identity: string;
  totalStake: string;
  totalDelegation: string;
  commission: string;
  specs: string[];
}>;

/** Fetch all providers across all specs, with dedup by address.
 *  Concurrent callers share one in-flight request (coalesced). */
export function fetchAllProviders(): Promise<AllProvidersResult> {
  if (pendingProviders) return pendingProviders;
  pendingProviders = fetchAllProvidersImpl().finally(() => { pendingProviders = null; });
  return pendingProviders;
}

async function fetchAllProvidersImpl(): Promise<AllProvidersResult> {
  const specs = await fetchAllSpecs();

  interface SpecEntry {
    address: string;
    moniker: string;
    identity: string;
    stake?: { amount: string };
    delegate_total?: { amount: string };
    delegate_commission: string;
    specId: string;
  }

  // Fetch in batches of 5 to avoid rate limiting on public RPC
  const specProviders: Array<Array<SpecEntry>> = [];
  for (let i = 0; i < specs.length; i += 5) {
    const batch = specs.slice(i, i + 5);
    const results = await Promise.all(
      batch.map((s) =>
        fetchProvidersForSpec(s.index)
          .then((providers) => providers.map((p): SpecEntry => ({
            address: p.address,
            moniker: p.moniker,
            identity: p.identity,
            stake: p.stake,
            delegate_total: p.delegate_total,
            delegate_commission: p.delegate_commission,
            specId: s.index,
          })))
          .catch(() => [] as SpecEntry[]),
      ),
    );
    specProviders.push(...results);
  }

  const byAddress = new Map<
    string,
    { moniker: string; identity: string; totalStake: bigint; totalDelegation: bigint; commission: string; specs: string[] }
  >();

  for (const providers of specProviders) {
    for (const p of providers) {
      const existing = byAddress.get(p.address);
      const stake = BigInt(p.stake?.amount ?? "0");
      const delegation = BigInt(p.delegate_total?.amount ?? "0");
      if (existing) {
        existing.totalStake += stake;
        existing.totalDelegation += delegation;
        existing.specs.push(p.specId);
        if (!existing.commission && p.delegate_commission) {
          existing.commission = p.delegate_commission;
        }
        if (!existing.identity && p.identity) {
          existing.identity = p.identity;
        }
      } else {
        byAddress.set(p.address, {
          moniker: p.moniker ?? "",
          identity: p.identity ?? "",
          totalStake: stake,
          totalDelegation: delegation,
          commission: p.delegate_commission ?? "",
          specs: [p.specId],
        });
      }
    }
  }

  return Array.from(byAddress.entries()).map(([address, data]) => ({
    address,
    moniker: data.moniker,
    identity: data.identity,
    totalStake: data.totalStake.toString(),
    totalDelegation: data.totalDelegation.toString(),
    commission: data.commission,
    specs: data.specs,
  }));
}

export async function fetchDelegatorRewards(provider: string): Promise<
  Array<{ denom: string; amount: string }>
> {
  try {
    const data = await fetchRest<{
      rewards: Array<{ provider: string; amount: Array<{ denom: string; amount: string }> }>;
    }>(`/lavanet/lava/dualstaking/delegator_rewards/${provider}`);
    const entry = data.rewards?.find((r) => r.provider === provider);
    return entry?.amount ?? [];
  } catch {
    return [];
  }
}

async function fetchProviderMetadata(provider: string): Promise<{
  description?: { identity?: string; moniker?: string };
} | null> {
  try {
    const specs = await fetchAllSpecs();
    for (const spec of specs) {
      try {
        const data = await fetchRest<{
          stakeEntry: Array<{
            address: string;
            description?: { identity?: string; moniker?: string };
          }>;
        }>(`/lavanet/lava/pairing/providers/${spec.index}`);
        const match = data.stakeEntry?.find((p) => p.address === provider);
        if (match?.description?.identity) return match;
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchProviderAvatar(provider: string, identityHint?: string): Promise<string | null> {
  try {
    let identity = identityHint;
    if (!identity) {
      const meta = await fetchProviderMetadata(provider);
      identity = meta?.description?.identity ?? undefined;
    }
    if (!identity) return null;

    const KEYBASE_API_URL = process.env.KEYBASE_API_URL ?? "https://keybase.io/_/api/1.0";
    const res = await fetch(
      `${KEYBASE_API_URL}/user/lookup.json?key_suffix=${encodeURIComponent(identity)}&fields=pictures`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      them?: Array<{ pictures?: { primary?: { url?: string } } }>;
    };
    return data.them?.[0]?.pictures?.primary?.url ?? null;
  } catch {
    return null;
  }
}
