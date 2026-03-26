import type { FastifyInstance } from "fastify";
import { fetchSupplyFromChain } from "../rpc/lava.js";

export async function supplyRoutes(app: FastifyInstance) {
  // GET /supply/total — fetched from chain RPC, cached 5 min
  app.get("/total", { config: { cacheTTL: 300 } }, async (_request, reply) => {
    const { total } = await fetchSupplyFromChain();
    reply.header("Content-Type", "text/plain");
    return total;
  });

  // GET /supply/circulating
  app.get("/circulating", { config: { cacheTTL: 300 } }, async (_request, reply) => {
    const { total } = await fetchSupplyFromChain();
    reply.header("Content-Type", "text/plain");
    return total;
  });
}
