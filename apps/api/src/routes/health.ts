import type { FastifyInstance } from "fastify";
import { fetchLatestBlockHeight } from "../rpc/lava.js";
import { sendApiError } from "../plugins/error-handler.js";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", {
    schema: {
      tags: ["Health"],
      summary: "Basic health check",
      response: { 200: { type: "object" as const, properties: { health: { type: "string" as const } } } },
    },
  }, async () => {
    return { health: "ok" };
  });

  if (process.env.NODE_ENV !== "production") {
    app.delete("/cache", async (_request, reply) => {
      const client = app.redis;
      if (!client) return sendApiError(reply, 404, "Redis not connected");

      await client.flushdb();
      return { cleared: true };
    });
  }

  app.get("/health/status", {
    schema: {
      tags: ["Health"],
      summary: "Detailed health status with block staleness check",
    },
    config: { cacheTTL: 10 },
  }, async (_request, reply) => {
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
