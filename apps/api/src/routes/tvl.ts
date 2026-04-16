import type { FastifyInstance } from "fastify";
import { CACHE_TTL } from "../config.js";
import { computeTVL } from "../rpc/lava.js";

export async function tvlRoutes(app: FastifyInstance) {
  // GET /tvl — computed from chain RPC, cached 5 min
  app.get("/tvl", {
    schema: { tags: ["TVL"], summary: "Total Value Locked in USD" },
    config: { cacheTTL: CACHE_TTL.LIST },
  }, async () => {
    return await computeTVL();
  });
}
