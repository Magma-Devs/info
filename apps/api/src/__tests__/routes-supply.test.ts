import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { paginationPlugin } from "../plugins/pagination.js";
import { errorHandlerPlugin } from "../plugins/error-handler.js";

vi.mock("../rpc/lava.js", () => ({
  fetchTotalSupply: vi.fn(),
  fetchCirculatingSupply: vi.fn(),
  fetchBlockAtTimestamp: vi.fn(),
}));

const { fetchTotalSupply, fetchCirculatingSupply, fetchBlockAtTimestamp } = await import("../rpc/lava.js");
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

  it("accepts unix timestamp for historical supply", async () => {
    (fetchBlockAtTimestamp as ReturnType<typeof vi.fn>).mockResolvedValue(3170337);
    (fetchTotalSupply as ReturnType<typeof vi.fn>).mockResolvedValue(900_000_000_000n);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/supply/total?timestamp=1713369600" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("900000");
    expect(fetchBlockAtTimestamp).toHaveBeenCalledWith(1713369600);
    expect(fetchTotalSupply).toHaveBeenCalledWith(3170337);
  });

  it("accepts ISO-8601 datetime for historical supply", async () => {
    (fetchBlockAtTimestamp as ReturnType<typeof vi.fn>).mockResolvedValue(3170337);
    (fetchTotalSupply as ReturnType<typeof vi.fn>).mockResolvedValue(900_000_000_000n);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/supply/total?timestamp=2025-04-17T15:00:00Z" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("900000");
    expect(fetchBlockAtTimestamp).toHaveBeenCalled();
    expect(fetchTotalSupply).toHaveBeenCalledWith(3170337);
  });

  it("returns 400 for invalid timestamp", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/supply/total?timestamp=not-a-date" });
    expect(res.statusCode).toBe(400);
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
