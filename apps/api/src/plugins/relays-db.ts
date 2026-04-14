import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import postgres from "postgres";

declare module "fastify" {
  interface FastifyInstance {
    relaysDb: ReturnType<typeof postgres> | null;
  }
}

export const relaysDbPlugin = fp(async (app: FastifyInstance) => {
  const url = process.env.RELAYS_DB_URL;
  if (!url) {
    app.decorate("relaysDb", null);
    app.log.warn("RELAYS_DB_URL not set — optimizer metrics disabled");
    return;
  }

  const sql = postgres(url, {
    idle_timeout: 20,
    connect_timeout: 5,
    max: 10,
  });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    await Promise.race([
      sql`SELECT 1`,
      new Promise((_, reject) => {
        controller.signal.addEventListener("abort", () =>
          reject(new Error("Relays DB connection timed out")));
      }),
    ]);
    clearTimeout(timeout);
  } catch (err) {
    app.log.error({ err }, "Failed to connect to relays DB — optimizer metrics disabled");
    await sql.end({ timeout: 1 }).catch(() => {});
    app.decorate("relaysDb", null);
    return;
  }

  app.decorate("relaysDb", sql);

  app.addHook("onClose", async () => {
    await sql.end();
  });
});
