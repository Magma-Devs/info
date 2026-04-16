import type { FastifyInstance } from "fastify";
import { CACHE_TTL } from "../config.js";
import { computeAPR } from "../rpc/lava.js";
import { readPrecomputed } from "../services/precompute-store.js";

interface AprResult {
  restaking_apr_percentile: number;
  staking_apr_percentile: number;
}

export async function aprRoutes(app: FastifyInstance) {
  // GET /apr — per-entity estimated rewards with USD conversion, cached 30 min.
  // Prefers the precomputed value from bin/precompute.ts; falls back to live
  // compute when the precompute worker hasn't populated the key yet.
  app.get("/apr", {
    schema: { tags: ["APR"], summary: "Restaking and staking APR percentiles (80th, capped at 30%)" },
    config: { cacheTTL: CACHE_TTL.APR },
  }, async (request) => {
    const cached = await readPrecomputed<AprResult>(request.server.redis, "apr");
    if (cached) return cached.value;
    return await computeAPR(request.server.redis);
  });
}
