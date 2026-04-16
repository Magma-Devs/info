import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { errorHandlerPlugin } from "../plugins/error-handler.js";
import { optimizerMetricsRoutes } from "../routes/optimizer-metrics.js";

async function buildApp(withDb: boolean) {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  if (withDb) {
    // Minimal tagged-template stub for routes that early-return when relaysDb is set;
    // we don't actually need to execute queries for these tests.
    const stub = Object.assign(() => ({}), { unsafe: () => "" });
    app.decorate("relaysDb", stub as never);
  } else {
    app.decorate("relaysDb", null);
  }
  await app.register(optimizerMetricsRoutes);
  return app;
}

describe("GET /providers/:addr/optimizer-metrics", () => {
  it("returns 503 when relays DB is not configured", async () => {
    const app = await buildApp(false);
    const res = await app.inject({
      method: "GET",
      url: "/providers/lava@abc/optimizer-metrics",
    });
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).error).toContain("not configured");
  });

  it("rejects invalid `from` date with 400", async () => {
    const app = await buildApp(true);
    const res = await app.inject({
      method: "GET",
      url: "/providers/lava@abc/optimizer-metrics?from=not-a-date",
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain("invalid from");
  });

  it("rejects invalid `to` date with 400", async () => {
    const app = await buildApp(true);
    const res = await app.inject({
      method: "GET",
      url: "/providers/lava@abc/optimizer-metrics?to=2025-02-30",
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain("invalid to");
  });
});

describe("GET /specs/:specId/optimizer-metrics", () => {
  it("returns 503 when relays DB is not configured", async () => {
    const app = await buildApp(false);
    const res = await app.inject({
      method: "GET",
      url: "/specs/ETH1/optimizer-metrics",
    });
    expect(res.statusCode).toBe(503);
  });
});
