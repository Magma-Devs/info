import type { FastifyInstance } from "fastify";
import { computeAPR } from "../rpc/lava.js";

export async function aprRoutes(app: FastifyInstance) {
  // GET /apr — computed from chain RPC, cached 5 min
  app.get("/apr", { config: { cacheTTL: 300 } }, async () => {
    return await computeAPR();
  });
}
