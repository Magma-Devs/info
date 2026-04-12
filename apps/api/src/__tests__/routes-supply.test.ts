import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { paginationPlugin } from "../plugins/pagination.js";
import { errorHandlerPlugin } from "../plugins/error-handler.js";

vi.mock("../rpc/lava.js", () => ({
  fetchTotalSupply: vi.fn(),
  fetchCirculatingSupply: vi.fn(),
}));

const { fetchTotalSupply, fetchCirculatingSupply } = await import("../rpc/lava.js");
const { supplyRoutes } = await import("../routes/supply.js");

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(paginationPlugin);
  await app.register(supplyRoutes, { prefix: "/supply" });
  return app;
}

describe("GET /supply/total", () => {
  it("returns total supply in lava (divided by 1M)", async () => {
    (fetchTotalSupply as ReturnType<typeof vi.fn>).mockResolvedValue(1_000_000_000_000n);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/supply/total" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("1000000");
  });
});

describe("GET /supply/circulating", () => {
  it("returns circulating supply in lava (divided by 1M)", async () => {
    (fetchCirculatingSupply as ReturnType<typeof vi.fn>).mockResolvedValue(500_000_000_000n);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/supply/circulating" });
    expect(res.body).toBe("500000");
  });
});
