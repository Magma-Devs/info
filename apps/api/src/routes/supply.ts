import type { FastifyInstance } from "fastify";
import { ulavaToLava } from "@info/shared/utils";
import { fetchTotalSupply, fetchCirculatingSupply } from "../rpc/lava.js";
import { readPrecomputed } from "../services/precompute-store.js";

export async function supplyRoutes(app: FastifyInstance) {
  // GET /supply/total — total token supply in lava, cached 5 min
  app.get("/total", {
    schema: { tags: ["Supply"], summary: "Total LAVA supply (plain text)" },
    config: { cacheTTL: 300, rateLimit: { max: 20, timeWindow: "1 minute" } },
  }, async (_request, reply) => {
    reply.header("Content-Type", "text/plain");
    return ulavaToLava(await fetchTotalSupply());
  });

  // GET /supply/circulating — total - locked vesting - reward pools, in lava.
  // Prefers the precomputed value written by bin/precompute.ts; falls back to
  // live compute when the precompute worker is down / has no entry yet.
  app.get("/circulating", {
    schema: { tags: ["Supply"], summary: "Circulating LAVA supply (plain text)" },
    config: { cacheTTL: 300, rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (_request, reply) => {
    reply.header("Content-Type", "text/plain");
    const cached = await readPrecomputed<string>(app.redis, "supply.circulating");
    if (cached) return cached.value;
    return ulavaToLava(await fetchCirculatingSupply());
  });
}
