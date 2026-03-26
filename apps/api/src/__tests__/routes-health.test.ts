import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { paginationPlugin } from "../plugins/pagination.js";
import { errorHandlerPlugin } from "../plugins/error-handler.js";

vi.mock("../rpc/lava.js", () => ({
  fetchLatestBlockHeight: vi.fn(),
}));

const { fetchLatestBlockHeight } = await import("../rpc/lava.js");
const { healthRoutes } = await import("../routes/health.js");

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(paginationPlugin);
  await app.register(healthRoutes);
  return app;
}

describe("GET /health", () => {
  it("returns ok", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ health: "ok" });
  });
});

describe("GET /health/status", () => {
  it("returns ok with fresh block", async () => {
    (fetchLatestBlockHeight as ReturnType<typeof vi.fn>).mockResolvedValue({
      height: 12345,
      time: new Date().toISOString(),
    });

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/health/status" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("ok");
    expect(body.components.latestBlock).toBe(12345);
    expect(body.components.isStale).toBe(false);
  });

  it("returns degraded with stale block", async () => {
    const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    (fetchLatestBlockHeight as ReturnType<typeof vi.fn>).mockResolvedValue({
      height: 100,
      time: staleTime,
    });

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/health/status" });
    const body = JSON.parse(res.body);
    expect(body.status).toBe("degraded");
    expect(body.components.isStale).toBe(true);
  });

  it("returns error on RPC failure", async () => {
    (fetchLatestBlockHeight as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("RPC down"));

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/health/status" });
    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("error");
    expect(body.components.rpc).toBe("error");
  });
});
