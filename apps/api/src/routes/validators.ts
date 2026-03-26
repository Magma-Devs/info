import type { FastifyInstance } from "fastify";
import { fetchStakingPool } from "../rpc/lava.js";

export async function validatorRoutes(app: FastifyInstance) {
  // GET /validators — staking pool from chain RPC, cached 5 min
  // Full validator list can be added when needed via /cosmos/staking/v1beta1/validators
  app.get("/", { config: { cacheTTL: 300 } }, async () => {
    const pool = await fetchStakingPool();
    return { data: [], pool };
  });
}
