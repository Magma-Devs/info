import type { FastifyInstance } from "fastify";
import { fetchLatestBlockHeight } from "../rpc/lava.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    return { health: "ok" };
  });

  if (process.env.NODE_ENV !== "production") {
    app.delete("/cache", async (_request, reply) => {
      const client = app.redis;
      if (!client) {
        reply.status(404);
        return { error: "Redis not connected" };
      }

      await client.flushdb();
      return { cleared: true };
    });
  }

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
