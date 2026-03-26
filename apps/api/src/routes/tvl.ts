import type { FastifyInstance } from "fastify";
import { computeTVL } from "../rpc/lava.js";

export async function tvlRoutes(app: FastifyInstance) {
  // GET /tvl — computed from chain RPC, cached 5 min
  app.get("/tvl", { config: { cacheTTL: 300 } }, async () => {
    return await computeTVL();
  });
}
