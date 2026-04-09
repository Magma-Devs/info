import type { FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import { fetchLatestBlockHeight } from "../rpc/lava.js";

async function scanKeys(client: Redis, pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = "0";
  do {
    const [next, batch] = await client.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = next;
    keys.push(...batch);
  } while (cursor !== "0");
  return keys;
}

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

      const cacheKeys = await scanKeys(client, "cache:*");
      const healthKeys = await scanKeys(client, "health:*");
      const allKeys = [...cacheKeys, ...healthKeys];
      if (allKeys.length > 0) {
        await client.del(...allKeys);
      }
      return { cleared: allKeys.length };
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
