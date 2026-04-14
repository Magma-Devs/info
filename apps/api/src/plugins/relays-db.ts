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
    connect_timeout: 10,
    max: 10,
  });

  try {
    await sql`SELECT 1`;
  } catch (err) {
    app.log.error({ err }, "Failed to connect to relays DB — optimizer metrics disabled");
    app.decorate("relaysDb", null);
    return;
  }

  app.decorate("relaysDb", sql);

  app.addHook("onClose", async () => {
    await sql.end();
  });
});
