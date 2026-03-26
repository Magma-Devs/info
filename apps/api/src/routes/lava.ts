import type { FastifyInstance } from "fastify";
import { fetchStakingPool, fetchAllSpecs, fetchProvidersForSpec } from "../rpc/lava.js";

export async function lavaRoutes(app: FastifyInstance) {
  // GET /lava/stakers — bonded tokens from staking pool
  app.get("/stakers", { config: { cacheTTL: 300 } }, async () => {
    const pool = await fetchStakingPool();
    return { bonded_tokens: pool.bonded_tokens };
  });

  // GET /lava/specs — all chain specs
  app.get("/specs", { config: { cacheTTL: 300 } }, async () => {
    const specs = await fetchAllSpecs();
    return { data: specs };
  });

  // GET /lava/iprpc — placeholder, requires IPRPC-specific RPC query
  app.get("/iprpc", { config: { cacheTTL: 300 } }, async () => {
    return { data: [] };
  });
}
