import type { FastifyInstance } from "fastify";
import { CACHE_TTL } from "../config.js";
import { fetchAllSpecs } from "../rpc/lava.js";

export async function lavaRoutes(app: FastifyInstance) {
  // GET /lava/specs — all chain specs (consumed by frontend useChainNames hook)
  app.get("/specs", {
    schema: { tags: ["Lava"], summary: "All chain specs (raw, for frontend chain name lookup)" },
    config: { cacheTTL: CACHE_TTL.LIST },
  }, async () => {
    const specs = await fetchAllSpecs();
    return { data: specs };
  });
}
