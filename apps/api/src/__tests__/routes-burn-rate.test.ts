import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { errorHandlerPlugin } from "../plugins/error-handler.js";

vi.mock("../graphql/client.js", () => ({
  gqlSafe: vi.fn(),
}));

vi.mock("../rpc/lava.js", () => ({
  fetchLatestBlockHeight: vi.fn(),
  fetchTotalSupply: vi.fn(),
}));

const { gqlSafe } = await import("../graphql/client.js");
const { fetchLatestBlockHeight, fetchTotalSupply } = await import("../rpc/lava.js");
const { burnRateRoutes } = await import("../routes/burn-rate.js");

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(burnRateRoutes);
  return app;
}

// Three monthly snapshots ordered newest-first (SNAPSHOT_DATE_DESC). Supply
// DECREASES over time (burning) — older rows hold more tokens.
const MOCK_SNAPSHOT_NODES = [
  { blockHeight: "4895283", blockTime: "2026-04-17T15:00:00Z", snapshotDate: "2026-04-17", totalSupply: "102000000" },
  { blockHeight: "4697952", blockTime: "2026-03-17T15:00:00Z", snapshotDate: "2026-03-17", totalSupply: "103000000" },
  { blockHeight: "4500123", blockTime: "2026-02-17T15:00:00Z", snapshotDate: "2026-02-17", totalSupply: "104000000" },
];

beforeEach(() => {
  vi.resetAllMocks();
  (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue({
    allSupplySnapshots: { nodes: MOCK_SNAPSHOT_NODES },
  });
  (fetchLatestBlockHeight as ReturnType<typeof vi.fn>).mockResolvedValue({
    height: 9_999_999,
    time: "2026-04-21T00:00:00Z",
  });
  // Live tip = 100 LAVA (supply keeps decreasing, so tip is lower than every
  // historical snapshot above — mirrors a burning chain).
  (fetchTotalSupply as ReturnType<typeof vi.fn>).mockResolvedValue(100_000_000n);
});

describe("GET /burn-rate", () => {
  it("returns monthly supply snapshots with supply_diff", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/burn-rate?months=3" });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.generated_at).toBeDefined();
    expect(body.latest.block).toBe(9_999_999);
    expect(body.latest.time).toBe("2026-04-21T00:00:00Z");
    expect(body.latest.supply).toBe("100000000");
    expect(body.blocks).toHaveLength(3);

    for (const b of body.blocks) {
      expect(typeof b.block).toBe("number");
      expect(typeof b.time).toBe("string");
      expect(typeof b.date).toBe("string");
      expect(b.date).toMatch(/^\d{4}-\d{2}-17$/);
      expect(typeof b.supply).toBe("string");
    }

    // Row 0 and the middle row have a string diff; the oldest row has null.
    expect(typeof body.blocks[0].supply_diff).toBe("string");
    expect(typeof body.blocks[1].supply_diff).toBe("string");
    expect(body.blocks[2].supply_diff).toBeNull();
  });

  it("computes supply_diff as previous_supply - current_supply", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/burn-rate?months=3" });
    const body = JSON.parse(res.body);

    // Row 0 diffs against the live tip: 100_000_000 - 102_000_000 = -2_000_000
    expect(body.blocks[0].supply_diff).toBe("-2000000");
    // Row 1 diffs against row 0: 102_000_000 - 103_000_000 = -1_000_000
    expect(body.blocks[1].supply_diff).toBe("-1000000");
    // Oldest row has no previous sample
    expect(body.blocks[2].supply_diff).toBeNull();
  });

  it("passes through block fields from the indexer unchanged", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/burn-rate?months=3" });
    const body = JSON.parse(res.body);
    expect(body.blocks[0].block).toBe(4_895_283);
    expect(body.blocks[0].time).toBe("2026-04-17T15:00:00Z");
    expect(body.blocks[0].date).toBe("2026-04-17");
    expect(body.blocks[0].supply).toBe("102000000");
  });

  it("defaults to 12 months when no query param", async () => {
    const app = await buildApp();
    await app.inject({ method: "GET", url: "/burn-rate" });
    // count=12 flows through as the `first` argument to the GraphQL call.
    expect(gqlSafe).toHaveBeenCalledTimes(1);
    const [, vars] = (gqlSafe as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect((vars as { count: number }).count).toBe(12);
  });

  it("passes months query param through to the GraphQL `first` argument", async () => {
    const app = await buildApp();
    await app.inject({ method: "GET", url: "/burn-rate?months=7" });
    expect(gqlSafe).toHaveBeenCalledTimes(1);
    const [query, vars] = (gqlSafe as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(query).toMatch(/first:\s*\$count/);
    expect((vars as { count: number }).count).toBe(7);
  });

  it("rejects months > 36", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/burn-rate?months=99" });
    expect(res.statusCode).toBe(400);
  });

  it("returns empty blocks when the indexer has no snapshots", async () => {
    (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue({
      allSupplySnapshots: { nodes: [] },
    });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/burn-rate?months=3" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.blocks).toEqual([]);
    // Live tip still populated from chain RPC.
    expect(body.latest.block).toBe(9_999_999);
    expect(body.latest.supply).toBe("100000000");
  });

  it("returns empty blocks when the indexer query fails (gqlSafe fallback)", async () => {
    (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/burn-rate?months=3" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.blocks).toEqual([]);
  });

  it("does not call the deprecated chain fan-out (fetchBlockAtTimestamp is gone)", async () => {
    const app = await buildApp();
    await app.inject({ method: "GET", url: "/burn-rate?months=3" });
    // Historical path is indexer-only now. Only fetchTotalSupply() for the tip
    // (no block-height arg) and fetchLatestBlockHeight() should fire.
    expect(fetchTotalSupply).toHaveBeenCalledTimes(1);
    expect(fetchTotalSupply).toHaveBeenCalledWith();
    expect(fetchLatestBlockHeight).toHaveBeenCalledTimes(1);
  });

  it("with a single-row result, the only row still gets null supply_diff (last-row rule)", async () => {
    (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue({
      allSupplySnapshots: { nodes: [MOCK_SNAPSHOT_NODES[0]] },
    });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/burn-rate?months=1" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.blocks).toHaveLength(1);
    expect(body.blocks[0].supply_diff).toBeNull();
  });
});
