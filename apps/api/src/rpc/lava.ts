import pino from "pino";

const logger = pino({ name: "rpc" });

const LAVA_REST_URL = process.env.LAVA_REST_URL ?? "https://lava.rest.lava.build";

async function fetchRest<T>(path: string): Promise<T> {
  const res = await fetch(`${LAVA_REST_URL}${path}`);
  if (!res.ok) throw new Error(`RPC ${res.status}: ${res.statusText}`);
  return (await res.json()) as T;
}

export async function fetchTotalSupply(): Promise<bigint> {
  const data = await fetchRest<{ supply: Array<{ denom: string; amount: string }> }>(
    "/cosmos/bank/v1beta1/supply",
  );
  const lava = data.supply?.find((c) => c.denom === "ulava");
  return BigInt(lava?.amount ?? "0");
}

const REWARD_POOLS = [
  "validators_rewards_distribution_pool",
  "validators_rewards_allocation_pool",
  "providers_rewards_distribution_pool",
  "providers_rewards_allocation_pool",
  "iprpc_pool",
];

export async function fetchRewardPoolsAmount(): Promise<bigint> {
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

interface VestingStats {
  continuousVesting: bigint;
  periodicVesting: bigint;
}

export async function fetchLockedVestingTokens(): Promise<VestingStats> {
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

export async function fetchAnnualProvisions(): Promise<string> {
  const data = await fetchRest<{ annual_provisions: string }>(
    "/cosmos/mint/v1beta1/annual_provisions",
  );
  return data.annual_provisions;
}

export async function fetchCommunityTax(): Promise<number> {
  const data = await fetchRest<{ params: { community_tax: string } }>(
    "/cosmos/distribution/v1beta1/params",
  );
  return parseFloat(data.params.community_tax);
}

export async function computeTVL(): Promise<{ tvl: string }> {
  const specs = await fetchAllSpecs();

  let totalStake = 0n;
  let totalDelegation = 0n;

  // Fetch in batches of 5 to avoid rate limiting
  const specProviders: Array<Array<{ stake?: { amount: string }; delegate_total?: { amount: string } }>> = [];
  for (let i = 0; i < specs.length; i += 5) {
    const batch = specs.slice(i, i + 5);
    const results = await Promise.all(
      batch.map((s) => fetchProvidersForSpec(s.index).catch(() => [])),
    );
    specProviders.push(...results);
  }

  for (const providers of specProviders) {
    for (const p of providers) {
      totalStake += BigInt(p.stake?.amount ?? "0");
      totalDelegation += BigInt(p.delegate_total?.amount ?? "0");
    }
  }

  // TVL = provider self-stakes + delegations, converted from ulava to LAVA
  const tvlUlava = totalStake + totalDelegation;
  const whole = tvlUlava / 1_000_000n;
  const frac = tvlUlava % 1_000_000n;
  const tvlLava = frac > 0n
    ? `${whole}.${frac.toString().padStart(6, "0").replace(/0+$/, "")}`
    : whole.toString();

  return { tvl: tvlLava };
}

export async function computeAPR(): Promise<{
  apr: number;
  annualProvisions: string;
  communityTax: number;
  bondedTokens: string;
}> {
  const [annualProvisions, communityTax, pool] = await Promise.all([
    fetchAnnualProvisions(),
    fetchCommunityTax(),
    fetchStakingPool(),
  ]);

  const provisions = parseFloat(annualProvisions);
  const bonded = parseFloat(pool.bonded_tokens);
  const apr = bonded > 0 ? (provisions * (1 - communityTax)) / bonded : 0;

  return {
    apr,
    annualProvisions,
    communityTax,
    bondedTokens: pool.bonded_tokens,
  };
}

export async function fetchLatestBlockHeight(): Promise<{
  height: number;
  time: string;
}> {
  const LAVA_RPC_URL = process.env.LAVA_RPC_URL ?? "https://lava.tendermintrpc.lava.build:443";
  const res = await fetch(`${LAVA_RPC_URL}/status`);
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const data = (await res.json()) as {
    result: { sync_info: { latest_block_height: string; latest_block_time: string } };
  };
  return {
    height: parseInt(data.result.sync_info.latest_block_height, 10),
    time: data.result.sync_info.latest_block_time,
  };
}

export interface RpcProvider {
  address: string;
  moniker: string;
  stake: { amount: string; denom: string };
  delegate_total: { amount: string; denom: string };
  delegate_limit: { amount: string; denom: string };
  delegate_commission: string;
  geolocation: number;
  addons: string;
  extensions: string;
}

/** Fetch all providers across all specs, with dedup by address */
export async function fetchAllProviders(): Promise<
  Array<{
    address: string;
    moniker: string;
    identity: string;
    totalStake: string;
    totalDelegation: string;
    commission: string;
    specs: string[];
  }>
> {
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

export async function fetchIprpcSpecRewards(specId: string): Promise<
  Array<{ provider: string; iprpcCu: string }>
> {
  try {
    const data = await fetchRest<{
      iprpc_rewards: Array<{ provider: string; iprpc_cu: string }>;
    }>(`/lavanet/lava/rewards/iprpc_spec_reward/${specId}`);
    return (data.iprpc_rewards ?? []).map((r) => ({
      provider: r.provider,
      iprpcCu: r.iprpc_cu ?? "0",
    }));
  } catch {
    return [];
  }
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

export async function fetchProviderMetadata(provider: string): Promise<{
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

    const res = await fetch(
      `https://keybase.io/_/api/1.0/user/lookup.json?key_suffix=${identity}&fields=pictures`,
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
