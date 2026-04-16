import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { Redis } from "ioredis";
import { config } from "../config.js";

declare module "fastify" {
  interface FastifyInstance {
    redis: Redis | null;
  }
}

export const redisPlugin = fp(async (app: FastifyInstance) => {
  const url = config.redis.url;
  if (!url) {
    app.decorate("redis", null);
    return;
  }

  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });

  try {
    await redis.connect();
  } catch {
    app.decorate("redis", null);
    return;
  }

  app.decorate("redis", redis);

  app.addHook("onClose", async () => {
    await redis.quit();
  });
});
