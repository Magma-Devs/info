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
const { fetchAllProviders } = await import("../rpc/lava.js");
const { providerRewardsRoutes } = await import("../routes/provider-rewards.js");

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(paginationPlugin);
  await app.register(providerRewardsRoutes);
  return app;
}

const MOCK_MV_RESPONSE = {
  mvRelayDailies: {
    groupedAggregates: [
      {
        keys: ["ETH1", "lava@1abc"],
        sum: {
          cu: "1000", relays: "500",
          qosSyncSum: 0.9, qosAvailSum: 0.9, qosLatencySum: 0.9, qosCount: "1", qosCu: "1000",
          exQosSyncSum: 0.8, exQosAvailSum: 0.8, exQosLatencySum: 0.8, exQosCount: "1",
        },
      },
      {
        keys: ["NEAR", "lava@1abc"],
        sum: {
          cu: "1000", relays: "500",
          qosSyncSum: 0.9, qosAvailSum: 0.9, qosLatencySum: 0.9, qosCount: "1", qosCu: "1000",
          exQosSyncSum: 0.8, exQosAvailSum: 0.8, exQosLatencySum: 0.8, exQosCount: "1",
        },
      },
      {
        keys: ["ETH1", "lava@2def"],
        sum: {
          cu: "1000", relays: "500",
          qosSyncSum: 0.9, qosAvailSum: 0.9, qosLatencySum: 0.9, qosCount: "1", qosCu: "1000",
          exQosSyncSum: 0.8, exQosAvailSum: 0.8, exQosLatencySum: 0.8, exQosCount: "1",
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
});

describe("GET /provider-rewards", () => {
  it("returns provider reward distribution with QoS fields", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-rewards?from=2025-01-01&to=2025-04-01",
    });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.meta.from).toBe("2025-01-01");
    expect(body.meta.to).toBe("2025-04-01");
    expect(body.meta.totalAdjustedRewards).toBeGreaterThan(0);
    expect(body.data).toHaveLength(2);

    // AlphaProvider has 2 specs, BetaProvider has 1 — Alpha should have higher total
    const alpha = body.data[0];
    expect(alpha.provider).toBe("lava@1abc");
    expect(alpha.moniker).toBe("AlphaProvider");
    expect(body.data[1].provider).toBe("lava@2def");

    // QoS response fields
    expect(alpha.avgLatency).toBeCloseTo(0.9, 6);
    expect(alpha.avgAvailability).toBeCloseTo(0.9, 6);
    expect(alpha.avgSync).toBeCloseTo(0.9, 6);
    expect(alpha.avgLatencyExc).toBeCloseTo(0.8, 6);
    expect(alpha.avgAvailabilityExc).toBeCloseTo(0.8, 6);
    expect(alpha.avgSyncExc).toBeCloseTo(0.8, 6);
    expect(alpha.qosCus).toBe(2000); // 1000 per spec × 2 specs
    expect(alpha.cus).toBe(2000);
    expect(alpha.relays).toBe(1000);

    // No estimate fields
    expect(alpha.estimatedRewardsLava).toBeUndefined();
    expect(alpha.estimatedRewardsUsd).toBeUndefined();
  });

  it("reward shares sum to 1", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-rewards?from=2025-01-01&to=2025-04-01",
    });
    const body = JSON.parse(res.body);
    const totalShare = body.data.reduce((sum: number, p: { rewardShare: number }) => sum + p.rewardShare, 0);
    expect(totalShare).toBeCloseTo(1.0, 10);
  });

  it("aggregates adjusted rewards across specs per provider", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-rewards?from=2025-01-01&to=2025-04-01",
    });
    const body = JSON.parse(res.body);
    const alpha = body.data.find((p: { provider: string }) => p.provider === "lava@1abc");
    const beta = body.data.find((p: { provider: string }) => p.provider === "lava@2def");

    // Alpha has 2 entries with equal rewards, Beta has 1 — Alpha should be 2x
    expect(alpha.adjustedRewards).toBeCloseTo(beta.adjustedRewards * 2, 6);
    expect(alpha.rewardShare).toBeCloseTo(2 / 3, 6);
    expect(beta.rewardShare).toBeCloseTo(1 / 3, 6);
  });

  it("returns empty data when no relay data exists", async () => {
    (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue({
      mvRelayDailies: { groupedAggregates: [] },
    });
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-rewards?from=2025-01-01&to=2025-04-01",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual([]);
    expect(body.meta.totalAdjustedRewards).toBe(0);
  });

  it("rejects missing from/to", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-rewards" });
    expect(res.statusCode).toBe(400);
  });

  it("rejects bad date format", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-rewards?from=2025-1-1&to=2025-04-01",
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects invalid date value", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-rewards?from=2025-99-99&to=2025-04-01",
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects calendar-invalid dates (Feb 30)", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-rewards?from=2025-02-30&to=2025-04-01",
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/bad from date/);
  });

  it("rejects calendar-invalid dates (Apr 31)", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-rewards?from=2025-01-01&to=2025-04-31",
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/bad to date/);
  });

  it("rejects date range exceeding 6 months", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-rewards?from=2024-01-01&to=2025-01-01",
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/6 months/);
  });

  it("swaps dates when to < from", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-rewards?from=2025-04-01&to=2025-01-01",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.meta.from).toBe("2025-01-01");
    expect(body.meta.to).toBe("2025-04-01");
  });

  it("rejects bad spec format", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-rewards?from=2025-01-01&to=2025-04-01&specs=a",
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/bad spec format/);
  });

  it("returns zero adjusted rewards when qosCu is zero", async () => {
    const zeroQosMv = {
      mvRelayDailies: {
        groupedAggregates: [{
          keys: ["ETH1", "lava@1abc"],
          sum: {
            cu: "1000", relays: "500",
            qosSyncSum: null, qosAvailSum: null, qosLatencySum: null, qosCount: "0", qosCu: "0",
            exQosSyncSum: null, exQosAvailSum: null, exQosLatencySum: null, exQosCount: "0",
          },
        }],
      },
    };
    (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue(zeroQosMv);
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-rewards?from=2025-01-01&to=2025-04-01",
    });
    const body = JSON.parse(res.body);
    expect(body.data[0].adjustedRewards).toBe(0);
    expect(body.data[0].avgLatency).toBe(0);
    expect(body.data[0].qosCus).toBe(0);
  });
});
