import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { paginationPlugin } from "../plugins/pagination.js";
import { errorHandlerPlugin } from "../plugins/error-handler.js";

vi.mock("../rpc/lava.js", () => ({
  fetchBlockAtTimestamp: vi.fn(),
  fetchLatestBlockHeight: vi.fn(),
  fetchTotalSupply: vi.fn(),
}));

const {
  fetchBlockAtTimestamp,
  fetchLatestBlockHeight,
  fetchTotalSupply,
} = await import("../rpc/lava.js");
const { burnRateRoutes } = await import("../routes/burn-rate.js");

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(paginationPlugin);
  await app.register(burnRateRoutes);
  return app;
}

beforeEach(() => {
  vi.resetAllMocks();
  // Each call to fetchBlockAtTimestamp returns a deterministic height derived from the timestamp
  (fetchBlockAtTimestamp as ReturnType<typeof vi.fn>).mockImplementation(
    (unix: number) => Promise.resolve(1_000_000 + Math.floor(unix / 1000)),
  );
  (fetchLatestBlockHeight as ReturnType<typeof vi.fn>).mockResolvedValue({
    height: 9_999_999,
    time: "2026-04-16T00:00:00Z",
  });
  // Supply DECREASES over time (burning) — each call returns a bigger number
  // for more recent blocks. We simulate that by basing the mock on blockHeight.
  (fetchTotalSupply as ReturnType<typeof vi.fn>).mockImplementation((blockHeight?: number) => {
    // Latest (no block) = 100 LAVA; older blocks have higher supply (before burning)
    if (blockHeight === undefined) return Promise.resolve(100_000_000n);
    // Each "older" block (lower height) has supply 1M higher than the next
    return Promise.resolve(BigInt(100_000_000 + (9_999_999 - blockHeight) * 1_000));
  });
});

describe("GET /burn-rate", () => {
  it("returns monthly supply snapshots with supply_diff", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/burn-rate?months=3",
    });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.generated_at).toBeDefined();
    expect(body.latest.block).toBe(9_999_999);
    expect(body.latest.supply).toBe("100000000");
    expect(body.blocks).toHaveLength(3);

    for (const b of body.blocks) {
      expect(typeof b.block).toBe("number");
      expect(typeof b.time).toBe("string");
      expect(typeof b.date).toBe("string");
      expect(b.date).toMatch(/^\d{4}-\d{2}-17$/);
      expect(typeof b.supply).toBe("string");
      expect(typeof b.supply_diff).toBe("string");
    }
  });

  it("computes supply_diff as previous_supply - current_supply", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/burn-rate?months=3",
    });
    const body = JSON.parse(res.body);

    // blocks[0].supply_diff should be latestSupply - blocks[0].supply.
    // latestSupply < blocks[0].supply because older blocks have more tokens
    // (supply decreases over time in this mock), so diff is negative.
    const diff0 = BigInt(body.blocks[0].supply_diff);
    const supply0 = BigInt(body.blocks[0].supply);
    const latestSupply = BigInt(body.latest.supply);
    expect(diff0).toBe(latestSupply - supply0);

    // blocks[1].supply_diff = blocks[0].supply - blocks[1].supply
    const diff1 = BigInt(body.blocks[1].supply_diff);
    const supply1 = BigInt(body.blocks[1].supply);
    expect(diff1).toBe(supply0 - supply1);
  });

  it("defaults to 12 months when no query param", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/burn-rate",
    });
    const body = JSON.parse(res.body);
    expect(body.blocks).toHaveLength(12);
  });

  it("rejects months > 36", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/burn-rate?months=99",
    });
    expect(res.statusCode).toBe(400);
  });

  it("skips snapshots where block resolution fails", async () => {
    (fetchBlockAtTimestamp as ReturnType<typeof vi.fn>).mockImplementation(
      (unix: number) => (unix % 2 === 0)
        ? Promise.reject(new Error("rpc error"))
        : Promise.resolve(1_500_000),
    );
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/burn-rate?months=4",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.blocks.length).toBeLessThan(4);
  });
});
