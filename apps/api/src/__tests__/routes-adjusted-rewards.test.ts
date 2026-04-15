import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { paginationPlugin } from "../plugins/pagination.js";
import { errorHandlerPlugin } from "../plugins/error-handler.js";

vi.mock("../graphql/client.js", () => ({
  gqlSafe: vi.fn(),
}));

vi.mock("../rpc/lava.js", () => ({
  fetchProvidersForSpec: vi.fn(),
  fetchAllProviders: vi.fn(),
}));

const { gqlSafe } = await import("../graphql/client.js");
const { fetchProvidersForSpec, fetchAllProviders } = await import("../rpc/lava.js");
const { adjustedRewardsRoutes } = await import("../routes/adjusted-rewards.js");

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(paginationPlugin);
  await app.register(adjustedRewardsRoutes);
  return app;
}

const MOCK_MV_RESPONSE = {
  mvRelayDailies: {
    groupedAggregates: [
      {
        keys: ["ETH1", "lava@1abc"],
        sum: {
          cu: "1000000",
          relays: "500000",
          qosSyncW: 0.95,
          qosAvailW: 0.99,
          qosLatencyW: 0.88,
          qosWeight: "1",
          exQosSyncW: 0.97,
          exQosAvailW: 0.995,
          exQosLatencyW: 0.90,
          exQosWeight: "1",
        },
      },
      {
        keys: ["NEAR", "lava@1abc"],
        sum: {
          cu: "200000",
          relays: "100000",
          qosSyncW: 0.90,
          qosAvailW: 0.85,
          qosLatencyW: 0.80,
          qosWeight: "1",
          exQosSyncW: 0.92,
          exQosAvailW: 0.87,
          exQosLatencyW: 0.82,
          exQosWeight: "1",
        },
      },
      {
        keys: ["ETH1", "lava@2def"],
        sum: {
          cu: "500000",
          relays: "250000",
          qosSyncW: 0.80,
          qosAvailW: 0.75,
          qosLatencyW: 0.70,
          qosWeight: "1",
          exQosSyncW: null,
          exQosAvailW: null,
          exQosLatencyW: null,
          exQosWeight: "0",
        },
      },
    ],
  },
};

const MOCK_PROVIDERS = [
  { address: "lava@1abc", moniker: "AlphaProvider" },
  { address: "lava@2def", moniker: "BetaProvider" },
];

beforeEach(() => {
  vi.resetAllMocks();
  (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_MV_RESPONSE);
  (fetchAllProviders as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_PROVIDERS);
  (fetchProvidersForSpec as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_PROVIDERS);
});

describe("GET /adjusted-rewards", () => {
  it("returns metrics grouped by provider (default)", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/adjusted-rewards?from=2025-01-01&to=2025-04-01",
    });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.data["lava@1abc"]).toBeDefined();
    expect(body.data["lava@1abc"].moniker).toBe("AlphaProvider");
    expect(body.data["lava@1abc"].specs.ETH1).toBeDefined();
    expect(body.data["lava@1abc"].specs.ETH1.relays).toBe(500000);
    expect(body.data["lava@1abc"].specs.ETH1.cus).toBe(1000000);
    expect(body.data["lava@1abc"].specs.NEAR).toBeDefined();
    expect(body.data["lava@2def"]).toBeDefined();
    expect(body.data["lava@2def"].moniker).toBe("BetaProvider");
  });

  it("returns metrics grouped by spec", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/adjusted-rewards?from=2025-01-01&to=2025-04-01&groupBy=spec",
    });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.data.ETH1).toHaveLength(2);
    expect(body.data.NEAR).toHaveLength(1);

    // Sorted by adjustedRewards descending
    expect(body.data.ETH1[0].provider).toBe("lava@1abc");
    expect(body.data.ETH1[1].provider).toBe("lava@2def");
  });

  it("filters by specs param", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/adjusted-rewards?from=2025-01-01&to=2025-04-01&specs=ETH1&specs=NEAR",
    });
    expect(res.statusCode).toBe(200);

    // Should use fetchProvidersForSpec instead of fetchAllProviders
    expect(fetchProvidersForSpec).toHaveBeenCalledWith("ETH1");
    expect(fetchProvidersForSpec).toHaveBeenCalledWith("NEAR");
    expect(fetchAllProviders).not.toHaveBeenCalled();
  });

  it("uses fetchAllProviders when no specs filter", async () => {
    const app = await buildApp();
    await app.inject({
      method: "GET",
      url: "/adjusted-rewards?from=2025-01-01&to=2025-04-01",
    });
    expect(fetchAllProviders).toHaveBeenCalled();
    expect(fetchProvidersForSpec).not.toHaveBeenCalled();
  });

  it("returns empty data when indexer is down (gqlSafe fallback)", async () => {
    (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue({
      mvRelayDailies: { groupedAggregates: [] },
    });
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/adjusted-rewards?from=2025-01-01&to=2025-04-01",
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toEqual({});
  });
});

describe("GET /adjusted-rewards — validation", () => {
  it("rejects missing from/to", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/adjusted-rewards",
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects bad date format", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/adjusted-rewards?from=2025-1-1&to=2025-04-01",
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects invalid date value", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/adjusted-rewards?from=2025-99-99&to=2025-04-01",
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects date range exceeding 6 months", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/adjusted-rewards?from=2024-01-01&to=2025-01-01",
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/6 months/);
  });

  it("swaps dates when to < from", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/adjusted-rewards?from=2025-04-01&to=2025-01-01",
    });
    expect(res.statusCode).toBe(200);
    // Verify the query used the swapped dates
    const callArgs = (gqlSafe as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].from).toBe("2025-01-01");
    expect(callArgs[1].to).toBe("2025-04-01");
  });

  it("rejects bad spec format", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/adjusted-rewards?from=2025-01-01&to=2025-04-01&specs=a",
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/bad spec format/);
  });

  it("accepts valid 3-char spec IDs (BTC, TRX)", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/adjusted-rewards?from=2025-01-01&to=2025-04-01&specs=BTC",
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("computeAdjustedRewards formula", () => {
  it("computes correct adjusted rewards from MV data", async () => {
    // Use a single-entry MV response to verify the formula precisely
    const singleEntry = {
      mvRelayDailies: {
        groupedAggregates: [{
          keys: ["ETH1", "lava@test"],
          sum: {
            cu: "1000",
            relays: "500",
            qosSyncW: 0.9,
            qosAvailW: 0.8,
            qosLatencyW: 0.7,
            qosWeight: "1",
            exQosSyncW: null,
            exQosAvailW: null,
            exQosLatencyW: null,
            exQosWeight: "0",
          },
        }],
      },
    };
    (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue(singleEntry);

    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/adjusted-rewards?from=2025-01-01&to=2025-04-01",
    });
    const body = JSON.parse(res.body);
    const metrics = body.data["lava@test"].specs.ETH1;

    // Formula: qosCus/2 + cbrt(avgLat * avgAvail * avgSync) * qosCus/2
    // avgLat=0.7, avgAvail=0.8, avgSync=0.9, qosCus=1000
    const expected = 1000 / 2 + Math.cbrt(0.7 * 0.8 * 0.9) * (1000 / 2);
    expect(metrics.adjustedRewards).toBeCloseTo(expected, 6);
    expect(metrics.avgLatency).toBeCloseTo(0.7);
    expect(metrics.avgAvailability).toBeCloseTo(0.8);
    expect(metrics.avgSync).toBeCloseTo(0.9);
  });

  it("returns zero adjusted rewards when qosWeight is zero", async () => {
    const zeroWeight = {
      mvRelayDailies: {
        groupedAggregates: [{
          keys: ["ETH1", "lava@test"],
          sum: {
            cu: "1000",
            relays: "500",
            qosSyncW: null,
            qosAvailW: null,
            qosLatencyW: null,
            qosWeight: "0",
            exQosSyncW: null,
            exQosAvailW: null,
            exQosLatencyW: null,
            exQosWeight: "0",
          },
        }],
      },
    };
    (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue(zeroWeight);

    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/adjusted-rewards?from=2025-01-01&to=2025-04-01",
    });
    const body = JSON.parse(res.body);
    const metrics = body.data["lava@test"].specs.ETH1;
    expect(metrics.adjustedRewards).toBe(0);
    expect(metrics.qosCus).toBe(0);
  });
});
