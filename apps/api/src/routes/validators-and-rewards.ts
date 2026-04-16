import type { FastifyInstance } from "fastify";
import { CACHE_TTL } from "../config.js";
import { fetchValidatorsWithRewards, type ValidatorWithRewards } from "../rpc/lava.js";
import { readPrecomputed } from "../services/precompute-store.js";

interface ValidatorsAndRewardsData {
  height: number;
  datetime: number;
  validators: ValidatorWithRewards[];
}

export async function validatorsAndRewardsRoutes(app: FastifyInstance) {
  // Replaces jsinfo's /lava_mainnet_validators_and_rewards. For each bonded
  // validator: fetches distribution rewards, outstanding rewards, estimated
  // rewards, delegations, and unbonding delegations — all converted to USD.
  //
  // Prefers the precomputed value from bin/precompute.ts; falls back to live
  // compute when the precompute worker hasn't populated the key yet.
  app.get("/validators-and-rewards", {
    schema: {
      tags: ["Validators"],
      summary: "All bonded validators with rewards, delegations, and unbonding — matches jsinfo shape",
    },
    config: { cacheTTL: CACHE_TTL.SLOW_MOVING },
  }, async (request) => {
    const cached = await readPrecomputed<ValidatorsAndRewardsData>(request.server.redis, "validators_and_rewards");
    if (cached) return { data: cached.value };
    const data = await fetchValidatorsWithRewards();
    return { data };
  });
}
