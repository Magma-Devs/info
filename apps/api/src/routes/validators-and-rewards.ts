import type { FastifyInstance } from "fastify";
import { fetchValidatorsWithRewards } from "../rpc/lava.js";

export async function validatorsAndRewardsRoutes(app: FastifyInstance) {
  // Replaces jsinfo's /lava_mainnet_validators_and_rewards. For each bonded
  // validator: fetches distribution rewards, outstanding rewards, estimated
  // rewards, delegations, and unbonding delegations — all converted to USD.
  app.get("/validators-and-rewards", {
    schema: {
      tags: ["Validators"],
      summary: "All bonded validators with rewards, delegations, and unbonding — matches jsinfo shape",
    },
    config: { cacheTTL: 7200 },
  }, async () => {
    const data = await fetchValidatorsWithRewards();
    return { data };
  });
}
