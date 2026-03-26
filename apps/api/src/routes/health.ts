import type { FastifyInstance } from "fastify";
import { fetchLatestBlockHeight } from "../rpc/lava.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    return { health: "ok" };
  });

  app.get("/health/status", { config: { cacheTTL: 10 } }, async (_request, reply) => {
    try {
      const block = await fetchLatestBlockHeight();
      const blockTime = new Date(block.time);
      const isStale = Date.now() - blockTime.getTime() > 5 * 60 * 1000;

      return {
        status: isStale ? "degraded" : "ok",
        components: {
          rpc: "ok",
          latestBlock: block.height,
          latestBlockTime: block.time,
          isStale,
        },
      };
    } catch {
      reply.status(503);
      return {
        status: "error",
        components: { rpc: "error" },
      };
    }
  });
}
