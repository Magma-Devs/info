import type { FastifyInstance } from "fastify";
import { computeAPR } from "../rpc/lava.js";

export async function aprRoutes(app: FastifyInstance) {
  // GET /apr — per-entity estimated rewards with USD conversion, cached 30 min
  app.get("/apr", {
    schema: { tags: ["APR"], summary: "Restaking and staking APR percentiles (80th, capped at 30%)" },
    config: { cacheTTL: 1800 },
  }, async (request) => {
    return await computeAPR(request.server.redis);
  });
}
