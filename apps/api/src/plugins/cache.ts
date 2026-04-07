import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

declare module "fastify" {
  interface FastifyContextConfig {
    cacheTTL?: number;
  }
}

function buildCacheKey(request: FastifyRequest): string {
  return `cache:${request.method}:${request.url}`;
}

/**
 * Generic Redis cache plugin. Replaces the 45+ RedisResourceBase subclasses.
 *
 * Usage: set `cacheTTL` in route config to enable caching for that route.
 *   app.get('/providers', { config: { cacheTTL: 300 } }, handler)
 */
export const cachePlugin = fp(async (app: FastifyInstance) => {
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const ttl = request.routeOptions.config?.cacheTTL;
    if (!ttl) return;

    const client = app.redis;
    if (!client) return;

    const key = buildCacheKey(request);
    try {
      const cached = await client.get(key);
      if (cached) {
        reply.header("X-Cache", "HIT");
        reply.header("Content-Type", "application/json; charset=utf-8");
        return reply.send(cached);
      }
    } catch {
      // Redis unavailable, skip cache
    }
  });

  app.addHook("onSend", async (request: FastifyRequest, reply: FastifyReply, payload: string) => {
    const ttl = request.routeOptions.config?.cacheTTL;
    if (!ttl) return payload;
    if (reply.getHeader("X-Cache") === "HIT") return payload;
    if (reply.statusCode >= 400) return payload;

    const client = app.redis;
    if (!client) return payload;

    const key = buildCacheKey(request);
    try {
      await client.set(key, payload as string, "EX", ttl);
    } catch {
      // Redis unavailable, skip
    }
    return payload;
  });
});
