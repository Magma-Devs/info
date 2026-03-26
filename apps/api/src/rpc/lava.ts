import pino from "pino";

const logger = pino({ name: "rpc" });

const LAVA_REST_URL = process.env.LAVA_REST_URL ?? "https://lava.rest.lava.build";

async function fetchRest<T>(path: string): Promise<T> {
  const res = await fetch(`${LAVA_REST_URL}${path}`);
  if (!res.ok) throw new Error(`RPC ${res.status}: ${res.statusText}`);
  return (await res.json()) as T;
}

export async function fetchSupplyFromChain(): Promise<{ total: string; denom: string }> {
  const data = await fetchRest<{ supply: Array<{ denom: string; amount: string }> }>(
    "/cosmos/bank/v1beta1/supply",
  );
  const lava = data.supply?.find((c) => c.denom === "ulava");
  return { total: lava?.amount ?? "0", denom: "ulava" };
}

export async function fetchProvidersForSpec(specId: string): Promise<
  Array<{
    address: string;
    moniker: string;
    stake: { amount: string };
    delegate_total: { amount: string };
    delegate_commission: string;
    geolocation: number;
  }>
> {
  const data = await fetchRest<{ stakeEntry: unknown[] }>(
    `/lavanet/lava/pairing/providers/${specId}`,
  );
  return (data.stakeEntry ?? []) as Array<{
    address: string;
    moniker: string;
    stake: { amount: string };
    delegate_total: { amount: string };
    delegate_commission: string;
    geolocation: number;
  }>;
}

export async function fetchAllSpecs(): Promise<Array<{ index: string; name: string }>> {
  const data = await fetchRest<{
    chainInfoList: Array<{ chainName: string; chainID: string }>;
  }>("/lavanet/lava/spec/show_all_chains");
  return (data.chainInfoList ?? []).map((c) => ({ index: c.chainID, name: c.chainName }));
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

export async function computeTVL(): Promise<{
  tvl: string;
  providerStakes: string;
  delegation: string;
  bondedTokens: string;
}> {
  const [specs, pool] = await Promise.all([
    fetchAllSpecs(),
    fetchStakingPool(),
  ]);

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

  const bondedTokens = BigInt(pool.bonded_tokens);
  const tvl = totalStake + totalDelegation + bondedTokens;

  return {
    tvl: tvl.toString(),
    providerStakes: totalStake.toString(),
    delegation: totalDelegation.toString(),
    bondedTokens: pool.bonded_tokens,
  };
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
}

/** Fetch all providers across all specs, with dedup by address */
export async function fetchAllProviders(): Promise<
  Array<{
    address: string;
    moniker: string;
    totalStake: string;
    totalDelegation: string;
    specs: string[];
  }>
> {
  const specs = await fetchAllSpecs();

  // Fetch in batches of 5 to avoid rate limiting on public RPC
  const specProviders: Array<Array<{ address: string; moniker: string; stake?: { amount: string }; delegate_total?: { amount: string }; specId: string }>> = [];
  for (let i = 0; i < specs.length; i += 5) {
    const batch = specs.slice(i, i + 5);
    const results = await Promise.all(
      batch.map((s) =>
        fetchProvidersForSpec(s.index)
          .then((providers) => providers.map((p) => ({ address: p.address, moniker: p.moniker, stake: p.stake, delegate_total: p.delegate_total, specId: s.index })))
          .catch(() => [] as Array<{ address: string; moniker: string; stake?: { amount: string }; delegate_total?: { amount: string }; specId: string }>),
      ),
    );
    specProviders.push(...results);
  }

  const byAddress = new Map<
    string,
    { moniker: string; totalStake: bigint; totalDelegation: bigint; specs: string[] }
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
      } else {
        byAddress.set(p.address, {
          moniker: p.moniker ?? "",
          totalStake: stake,
          totalDelegation: delegation,
          specs: [p.specId],
        });
      }
    }
  }

  return Array.from(byAddress.entries()).map(([address, data]) => ({
    address,
    moniker: data.moniker,
    totalStake: data.totalStake.toString(),
    totalDelegation: data.totalDelegation.toString(),
    specs: data.specs,
  }));
}

export async function fetchSubscriptionList(): Promise<
  Array<{ consumer: string; plan: string }>
> {
  const data = await fetchRest<{
    subs_info: Array<{ consumer: string; plan: { index: string } }>;
  }>("/lavanet/lava/subscription/list");
  return (data.subs_info ?? []).map((s) => ({
    consumer: s.consumer,
    plan: s.plan?.index ?? "",
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
