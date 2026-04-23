import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { errorHandlerPlugin } from "../plugins/error-handler.js";

// /burn-rate reads from the indexer (lava-indexer's app.supply_snapshots
// exposed via PostGraphile as allSupplySnapshots). Mock gqlSafe so tests
// don't touch a real GraphQL server — the route does nothing else of
// substance.
vi.mock("../graphql/client.js", () => ({
  gqlSafe: vi.fn(),
}));

const { gqlSafe } = await import("../graphql/client.js");
const { burnRateRoutes } = await import("../routes/burn-rate.js");

// Build `count` supply-snapshot nodes in DESC order by date (newest first)
// with a monotonically-decreasing supply — matches the real chain's burn
// behaviour (older snapshots have more tokens, supply trends down over
// time). `baseSupply` is the *newest* row's supply; older rows are
// `baseSupply + (i * 1_000_000)` so older > newer as on mainnet.
function makeNodes(count: number, baseSupply = 100_000_000) {
  const now = Date.UTC(2026, 3, 17, 15, 0, 0); // 2026-04-17 15:00 UTC
  const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
  return Array.from({ length: count }, (_, i) => {
    const t = new Date(now - i * MONTH_MS);
    const date = t.toISOString().slice(0, 10);
    const time = t.toISOString();
    return {
      snapshotDate: date,
      blockHeight: String(9_000_000 - i * 200_000),
      blockTime: time,
      totalSupply: String(baseSupply + i * 1_000_000),
    };
  });
}

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(burnRateRoutes);
  return app;
}

beforeEach(() => {
  vi.resetAllMocks();
  // Default mock: 3 nodes. Individual tests override when they need more.
  (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue({
    allSupplySnapshots: { nodes: makeNodes(3) },
  });
});

describe("GET /burn-rate", () => {
  it("returns monthly supply snapshots with supply_diff", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/burn-rate?months=3" });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.generated_at).toBeDefined();

    // `latest` now reflects the most recent snapshot (nodes[0]), not chain tip —
    // the indexer doesn't snapshot at tip, only at the monthly-17th anchor.
    expect(body.latest.block).toBe(9_000_000);
    expect(body.latest.supply).toBe("100000000");
    expect(body.blocks).toHaveLength(3);

    for (const b of body.blocks) {
      expect(typeof b.block).toBe("number");
      expect(typeof b.time).toBe("string");
      expect(typeof b.date).toBe("string");
      expect(typeof b.supply).toBe("string");
      expect(typeof b.supply_diff).toBe("string");
    }
  });

  it("computes supply_diff as older.supply - current.supply (positive = burn)", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/burn-rate?months=3" });
    const body = JSON.parse(res.body);

    // Convention: for row i, supply_diff = nodes[i+1].supply - nodes[i].supply.
    // Older row has MORE supply (burning reduces supply over time), so the
    // subtraction is positive on a burning chain. The oldest row has no
    // older reference → diff = 0. Matches the pre-migration static-JSON
    // shape and burn-ui's `if (item.diff > 0) totalBurn += item.diff` gate.
    const blocks = body.blocks;
    const supply0 = BigInt(blocks[0].supply); // newest
    const supply1 = BigInt(blocks[1].supply);
    const supply2 = BigInt(blocks[2].supply); // oldest

    expect(BigInt(blocks[0].supply_diff)).toBe(supply1 - supply0); // positive
    expect(BigInt(blocks[1].supply_diff)).toBe(supply2 - supply1); // positive
    expect(BigInt(blocks[2].supply_diff)).toBe(0n);                // oldest
  });

  it("defaults to 12 months when no query param", async () => {
    (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue({
      allSupplySnapshots: { nodes: makeNodes(12) },
    });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/burn-rate" });
    const body = JSON.parse(res.body);
    expect(body.blocks).toHaveLength(12);

    // The route must pass `first: 12` to the GraphQL query by default, so
    // the indexer doesn't return more than 12 rows — which would break
    // callers relying on the documented default.
    expect(gqlSafe).toHaveBeenCalledWith(
      expect.stringContaining("allSupplySnapshots"),
      expect.objectContaining({ first: 12 }),
      null,
    );
  });

  it("rejects months > 36", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/burn-rate?months=99" });
    expect(res.statusCode).toBe(400);
  });

  it("handles empty response (no snapshots yet)", async () => {
    (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue({
      allSupplySnapshots: { nodes: [] },
    });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/burn-rate?months=6" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.blocks).toEqual([]);
    // No most-recent row to surface → latest is null. Clients must handle
    // this (burn-ui already does).
    expect(body.latest).toBeNull();
  });
});
