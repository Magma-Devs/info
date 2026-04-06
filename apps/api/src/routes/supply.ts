import type { FastifyInstance } from "fastify";
import { fetchTotalSupply, fetchCirculatingSupply } from "../rpc/lava.js";

const ULAVA_TO_LAVA = 1_000_000n;

export async function supplyRoutes(app: FastifyInstance) {
  // GET /supply/total — total token supply in lava, cached 5 min
  app.get("/total", { config: { cacheTTL: 300 } }, async (_request, reply) => {
    const total = await fetchTotalSupply();
    reply.header("Content-Type", "text/plain");
    return (total / ULAVA_TO_LAVA).toString();
  });

  // GET /supply/circulating — total - locked vesting - reward pools, in lava
  app.get("/circulating", { config: { cacheTTL: 300 } }, async (_request, reply) => {
    const circulating = await fetchCirculatingSupply();
    reply.header("Content-Type", "text/plain");
    return (circulating / ULAVA_TO_LAVA).toString();
  });
}
