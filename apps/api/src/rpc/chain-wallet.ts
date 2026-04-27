import { RPC_BATCH_SIZE } from "./rest.js";
import { fetchAllProviders, fetchProviderDelegations } from "./providers.js";

export interface ChainDelegatorCounts {
  total: string;
  monthly: string;
}

const MONTHLY_WINDOW_SECONDS = 30 * 24 * 60 * 60;

/** Count unique delegator addresses across all active providers.
 *
 *  - `includeEmptyProvider: true`  → "stakers" semantics (provider + validator-only delegations)
 *  - `includeEmptyProvider: false` → "restakers" semantics (only delegations that picked a provider)
 *
 *  Mirrors jsinfo's `GetUniqueDelegatorCount` in `LavaRpcPeriodicEndpointCache.ts`.
 *  `monthly` filters to delegations whose `timestamp` ≥ now - 30d.
 */
export async function countUniqueDelegators(
  includeEmptyProvider: boolean,
): Promise<ChainDelegatorCounts> {
  const providers = await fetchAllProviders();
  const addresses = providers.map((p) => p.address);
  if (includeEmptyProvider) addresses.push("empty_provider");

  const totalSet = new Set<string>();
  const monthlySet = new Set<string>();
  const monthlyCutoff = Math.floor(Date.now() / 1000) - MONTHLY_WINDOW_SECONDS;

  for (let i = 0; i < addresses.length; i += RPC_BATCH_SIZE) {
    const batch = addresses.slice(i, i + RPC_BATCH_SIZE);
    const responses = await Promise.all(batch.map((addr) => fetchProviderDelegations(addr)));
    for (const delegations of responses) {
      for (const d of delegations) {
        const delegator = d.delegator?.trim();
        if (!delegator) continue;
        totalSet.add(delegator);
        if (Number(d.timestamp) >= monthlyCutoff) {
          monthlySet.add(delegator);
        }
      }
    }
  }

  return {
    total: totalSet.size.toString(),
    monthly: monthlySet.size.toString(),
  };
}
