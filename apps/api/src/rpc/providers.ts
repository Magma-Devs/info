import { RPC_BATCH_SIZE, fetchRest } from "./rest.js";
import { fetchAllSpecs } from "./specs.js";

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

/** Fetch all providers staked on a given spec at `blockHeight` (or current if
 *  omitted). Historical queries require an archive node and are only used by
 *  the rewards endpoints — everything else should pass undefined. */
export async function fetchProvidersForSpec(
  specId: string,
  blockHeight?: number,
): Promise<ProviderForSpec[]> {
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
  }>(`/lavanet/lava/pairing/providers/${specId}`, blockHeight);

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

export interface ProviderSpecEntry {
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

/** Build per-provider spec data + address list + spec name map from chain RPC.
 *  Pass `blockHeight` to snapshot the provider set at a historical block —
 *  this is how the rewards endpoints recover providers who were active at
 *  the block but have since deregistered. Only rewards callers pass this;
 *  everything else uses the current (default) provider set. */
export async function fetchProvidersWithSpecs(
  blockHeight?: number,
): Promise<{
  providers: Map<string, { moniker: string; identity: string; commission: string; specs: ProviderSpecEntry[] }>;
  specNames: Map<string, string>;
}> {
  const allSpecs = await fetchAllSpecs();
  const specNames = new Map(allSpecs.map((s) => [s.index, s.name]));
  const byAddress = new Map<
    string,
    { moniker: string; identity: string; commission: string; specs: ProviderSpecEntry[] }
  >();

  for (let i = 0; i < allSpecs.length; i += RPC_BATCH_SIZE) {
    const batch = allSpecs.slice(i, i + RPC_BATCH_SIZE);
    // No .catch() — fetchRest now retries transient failures (5xx, 429,
    // network) up to 3 times. If it still throws, we'd rather 500 loudly
    // than silently drop providers and cache an incomplete response. The
    // cache plugin skips 4xx/5xx so a failed request never poisons Redis.
    const results = await Promise.all(
      batch.map((s) => fetchProvidersForSpec(s.index, blockHeight)
        .then((ps) => ps.map((p) => ({ ...p, specId: s.index, specName: s.name })))),
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

export type AllProvidersResult = Array<{
  address: string;
  moniker: string;
  identity: string;
  totalStake: string;
  totalDelegation: string;
  commission: string;
  specs: string[];
}>;

// Request coalescing: concurrent callers share one in-flight fetchAllProviders
let pendingProviders: Promise<AllProvidersResult> | null = null;

/** Fetch all providers across all specs, with dedup by address.
 *  Concurrent callers share one in-flight request (coalesced). */
export function fetchAllProviders(): Promise<AllProvidersResult> {
  if (pendingProviders) return pendingProviders;
  pendingProviders = fetchAllProvidersImpl().finally(() => { pendingProviders = null; });
  return pendingProviders;
}

// Moniker-only cache. Routes that need just address→moniker shouldn't pay
// the full fetchAllProviders cost (stake/delegation/commission/specs) on
// cache misses. 60s TTL is short enough to stay fresh, long enough to
// deduplicate the 3+ reward routes that all call it in the same minute.
const MONIKER_CACHE_TTL_MS = 60_000;
let monikerCache: { at: number; map: Map<string, string> } | null = null;
let pendingMonikers: Promise<Map<string, string>> | null = null;

/** address → moniker map. 60-second in-process cache shared across routes. */
export function fetchAllProviderMonikers(): Promise<Map<string, string>> {
  if (monikerCache && Date.now() - monikerCache.at < MONIKER_CACHE_TTL_MS) {
    return Promise.resolve(monikerCache.map);
  }
  if (pendingMonikers) return pendingMonikers;
  pendingMonikers = (async () => {
    const providers = await fetchAllProviders();
    const map = new Map<string, string>();
    for (const p of providers) map.set(p.address, p.moniker);
    monikerCache = { at: Date.now(), map };
    return map;
  })().finally(() => { pendingMonikers = null; });
  return pendingMonikers;
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

  // Fetch in batches of RPC_BATCH_SIZE — raise via env for dedicated RPC endpoints.
  const specProviders: Array<Array<SpecEntry>> = [];
  for (let i = 0; i < specs.length; i += RPC_BATCH_SIZE) {
    const batch = specs.slice(i, i + RPC_BATCH_SIZE);
    const results = await Promise.all(
      // Same rationale as fetchProvidersWithSpecs: no .catch(). fetchRest
      // retries transient failures; if it still throws, fail loud rather
      // than silently drop providers from /providers or /all_providers_apr.
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
          }))),
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

export interface ProviderDelegation {
  provider: string;
  chainID: string;
  delegator: string;
  amount: { denom: string; amount: string };
  /** Unix seconds, returned as a numeric string by the chain. */
  timestamp: string;
}

/** Fetch delegators for a single provider via the dualstaking module.
 *  Pass `"empty_provider"` to retrieve delegators that came in through the
 *  cosmos validator path without explicitly choosing a provider. */
export async function fetchProviderDelegations(provider: string): Promise<ProviderDelegation[]> {
  try {
    const data = await fetchRest<{ delegations?: ProviderDelegation[] }>(
      `/lavanet/lava/dualstaking/provider_delegators/${provider}`,
    );
    return data.delegations ?? [];
  } catch {
    return [];
  }
}
