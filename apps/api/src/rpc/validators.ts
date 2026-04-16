import { RPC_BATCH_SIZE, fetchRest } from "./rest.js";
import { fetchLatestBlockHeight } from "./block.js";
import { prewarmPriceCache } from "./pricing.js";
import {
  type EstimatedRewardsResponse,
  type RewardToken,
  type TokenBreakdown,
  rewardsToBreakdown,
} from "./rewards.js";

export interface ValidatorCommissionRates {
  rate: string;
  max_rate: string;
  max_change_rate: string;
}

export interface ValidatorCommission {
  commission_rates: ValidatorCommissionRates;
  update_time: string;
}

export interface ValidatorBase {
  operator_address: string;
  description?: { moniker?: string };
  jailed: boolean;
  tokens: string;
  commission: ValidatorCommission;
}

interface RewardCoin { denom: string; amount: string }

export interface ValidatorDistributionRewards {
  self_bond_rewards: TokenBreakdown;
  commission: TokenBreakdown;
  operator_address: string;
}

export interface ValidatorDelegationResponse {
  delegation: {
    delegator_address: string;
    validator_address: string;
    shares: string;
  };
  balance: RewardCoin;
}

export interface ValidatorUnbondingEntry {
  creation_height: string;
  completion_time: string;
  initial_balance: string;
  balance: string;
  unbonding_id: string;
  unbonding_on_hold_ref_count: string;
}

export interface ValidatorUnbondingResponse {
  delegator_address: string;
  validator_address: string;
  entries: ValidatorUnbondingEntry[];
}

export interface ValidatorWithRewards {
  address: string;
  moniker: string;
  jailed: boolean;
  tokens: string;
  commission: ValidatorCommission;
  apr?: number | null;
  distribution: ValidatorDistributionRewards;
  outstanding_rewards: TokenBreakdown;
  estimated_rewards: TokenBreakdown;
  delegations: {
    delegation_responses: ValidatorDelegationResponse[];
    pagination: { next_key: string | null; total: string };
  };
  unbonding_delegations: {
    unbonding_responses: ValidatorUnbondingResponse[];
    pagination: { next_key: string | null; total: string };
  };
}

async function fetchAllValidatorObjects(): Promise<ValidatorBase[]> {
  const validators: ValidatorBase[] = [];
  let nextKey: string | null = null;
  do {
    const params = new URLSearchParams({
      status: "BOND_STATUS_BONDED",
      "pagination.limit": "200",
    });
    if (nextKey) params.set("pagination.key", nextKey);
    const data = await fetchRest<{
      validators: ValidatorBase[];
      pagination: { next_key: string | null };
    }>(`/cosmos/staking/v1beta1/validators?${params}`);
    for (const v of data.validators ?? []) validators.push(v);
    nextKey = data.pagination?.next_key ?? null;
  } while (nextKey);
  return validators;
}

interface ValidatorDistributionRewardsResponse {
  operator_address: string;
  self_bond_rewards: RewardCoin[];
  commission: RewardCoin[];
}

async function fetchValidatorDistribution(
  addr: string,
): Promise<ValidatorDistributionRewardsResponse | null> {
  try {
    return await fetchRest<ValidatorDistributionRewardsResponse>(
      `/cosmos/distribution/v1beta1/validators/${addr}`,
    );
  } catch { return null; }
}

async function fetchValidatorOutstanding(addr: string): Promise<RewardCoin[]> {
  try {
    const data = await fetchRest<{ rewards: { rewards: RewardCoin[] } }>(
      `/cosmos/distribution/v1beta1/validators/${addr}/outstanding_rewards`,
    );
    return data.rewards?.rewards ?? [];
  } catch { return []; }
}

async function fetchValidatorEstimatedTotal(addr: string): Promise<RewardCoin[]> {
  try {
    const data = await fetchRest<EstimatedRewardsResponse>(
      `/lavanet/lava/subscription/estimated_validator_rewards/${addr}/`,
    );
    return data.total ?? [];
  } catch { return []; }
}

async function fetchValidatorDelegationsPage(
  addr: string,
): Promise<{ delegation_responses: ValidatorDelegationResponse[]; pagination: { next_key: string | null; total: string } }> {
  try {
    return await fetchRest(`/cosmos/staking/v1beta1/validators/${addr}/delegations?pagination.limit=1000&pagination.count_total=true`);
  } catch {
    return { delegation_responses: [], pagination: { next_key: null, total: "0" } };
  }
}

async function fetchValidatorUnbondingPage(
  addr: string,
): Promise<{ unbonding_responses: ValidatorUnbondingResponse[]; pagination: { next_key: string | null; total: string } }> {
  try {
    return await fetchRest(`/cosmos/staking/v1beta1/validators/${addr}/unbonding_delegations?pagination.limit=1000&pagination.count_total=true`);
  } catch {
    return { unbonding_responses: [], pagination: { next_key: null, total: "0" } };
  }
}

/**
 * Build the full validator-with-rewards list matching jsinfo's
 * /lava_mainnet_validators_and_rewards response shape.
 *
 * Each validator requires 5 chain RPC calls; processes RPC_BATCH_SIZE at a time
 * to respect rate limits. With ~50 validators this completes in ~20-30s cold,
 * well within the 6h cache window.
 */
export async function fetchValidatorsWithRewards(): Promise<{
  height: number;
  datetime: number;
  validators: ValidatorWithRewards[];
}> {
  await prewarmPriceCache();

  const [validators, latestBlock] = await Promise.all([
    fetchAllValidatorObjects(),
    fetchLatestBlockHeight(),
  ]);

  const enriched: ValidatorWithRewards[] = [];

  for (let i = 0; i < validators.length; i += RPC_BATCH_SIZE) {
    const batch = validators.slice(i, i + RPC_BATCH_SIZE);
    const results = await Promise.all(batch.map(async (v) => {
      const addr = v.operator_address;
      const [dist, outstanding, estimatedTotal, delegations, unbonding] = await Promise.all([
        fetchValidatorDistribution(addr),
        fetchValidatorOutstanding(addr),
        fetchValidatorEstimatedTotal(addr),
        fetchValidatorDelegationsPage(addr),
        fetchValidatorUnbondingPage(addr),
      ]);

      const [selfBond, commissionBreakdown, outstandingBreakdown, estimatedBreakdown] = await Promise.all([
        rewardsToBreakdown(dist?.self_bond_rewards),
        rewardsToBreakdown(dist?.commission),
        rewardsToBreakdown(outstanding),
        rewardsToBreakdown(estimatedTotal),
      ]);

      return {
        address: addr,
        moniker: v.description?.moniker ?? "",
        jailed: v.jailed,
        tokens: v.tokens,
        commission: v.commission,
        distribution: {
          self_bond_rewards: selfBond,
          commission: commissionBreakdown,
          operator_address: dist?.operator_address ?? addr,
        },
        outstanding_rewards: outstandingBreakdown,
        estimated_rewards: estimatedBreakdown,
        delegations,
        unbonding_delegations: unbonding,
      } satisfies ValidatorWithRewards;
    }));
    enriched.push(...results);
  }

  return {
    height: latestBlock.height,
    datetime: Math.floor(new Date(latestBlock.time).getTime() / 1000),
    validators: enriched,
  };
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

// Re-export RewardToken so callers consuming ValidatorWithRewards can type tokens.
export type { RewardToken };
