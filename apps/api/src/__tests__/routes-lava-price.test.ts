import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { paginationPlugin } from "../plugins/pagination.js";
import { errorHandlerPlugin } from "../plugins/error-handler.js";

vi.mock("../rpc/lava.js", () => ({
  fetchAllSpecs: vi.fn(),
  fetchLavaUsdPrice: vi.fn(),
  fetchLavaUsdPriceAt: vi.fn(),
}));

const { fetchLavaUsdPrice, fetchLavaUsdPriceAt } = await import("../rpc/lava.js");
const { lavaRoutes } = await import("../routes/lava.js");

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(paginationPlugin);
  await app.register(lavaRoutes, { prefix: "/lava" });
  return app;
}

describe("GET /lava/price", () => {
  it("returns current price when no date param", async () => {
    (fetchLavaUsdPrice as ReturnType<typeof vi.fn>).mockResolvedValue(0.042);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/lava/price" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.price).toBe(0.042);
    expect(body).not.toHaveProperty("date");
  });

  it("returns historical price for YYYY-MM-DD date", async () => {
    (fetchLavaUsdPriceAt as ReturnType<typeof vi.fn>).mockResolvedValue(0.035);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/lava/price?date=2025-01-17" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.price).toBe(0.035);
    expect(body.date).toBe("2025-01-17");
    expect(fetchLavaUsdPriceAt).toHaveBeenCalled();
  });

  it("returns historical price for unix timestamp", async () => {
    (fetchLavaUsdPriceAt as ReturnType<typeof vi.fn>).mockResolvedValue(0.038);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/lava/price?date=1713369600" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.price).toBe(0.038);
  });

  it("returns 400 for invalid date", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/lava/price?date=garbage" });
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for future date", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/lava/price?date=2099-01-01" });
    expect(res.statusCode).toBe(400);
  });
});
