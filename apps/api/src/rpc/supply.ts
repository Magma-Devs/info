import { fetchRest, logger } from "./rest.js";

export async function fetchTotalSupply(blockHeight?: number): Promise<bigint> {
  const data = await fetchRest<{ supply: Array<{ denom: string; amount: string }> }>(
    "/cosmos/bank/v1beta1/supply",
    blockHeight,
  );
  const lava = data.supply?.find((c) => c.denom === "ulava");
  return BigInt(lava?.amount ?? "0");
}

export async function fetchStakingPool(): Promise<{ bonded_tokens: string; not_bonded_tokens: string }> {
  const data = await fetchRest<{ pool: { bonded_tokens: string; not_bonded_tokens: string } }>(
    "/cosmos/staking/v1beta1/pool",
  );
  return data.pool;
}

interface RewardPool {
  name: string;
  balance: Array<{ denom: string; amount: string }>;
}

/** Shared fetch for reward pools — both consumers filter by pool name. */
export async function fetchRewardPools(): Promise<RewardPool[]> {
  const data = await fetchRest<{ pools: RewardPool[] }>("/lavanet/lava/rewards/pools");
  return data.pools ?? [];
}

function sumPoolsUlava(pools: RewardPool[], names: string[]): bigint {
  const nameSet = new Set(names);
  let total = 0n;
  for (const pool of pools) {
    if (nameSet.has(pool.name)) {
      for (const coin of pool.balance ?? []) {
        if (coin.denom === "ulava") total += BigInt(coin.amount);
      }
    }
  }
  return total;
}

const ALL_REWARD_POOLS = [
  "validators_rewards_distribution_pool",
  "validators_rewards_allocation_pool",
  "providers_rewards_distribution_pool",
  "providers_rewards_allocation_pool",
  "iprpc_pool",
];

async function fetchRewardPoolsAmount(): Promise<bigint> {
  return sumPoolsUlava(await fetchRewardPools(), ALL_REWARD_POOLS);
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
