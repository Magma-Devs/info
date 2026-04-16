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

// Default groupBy=provider: GraphQL aggregates across chains per provider,
// so each group has keys=[provider] with sums pooled over all specs.
// Alpha is 2x Beta because Alpha serves 2 specs with identical per-spec numbers.
const MOCK_MV_PROVIDER = {
  mvRelayDailies: {
    groupedAggregates: [
      {
        keys: ["lava@1abc"],
        sum: {
          cu: "2000", relays: "1000",
          qosSyncSum: 1.8, qosAvailSum: 1.8, qosLatencySum: 1.8, qosCount: "2", qosCu: "2000",
          exQosSyncSum: 1.6, exQosAvailSum: 1.6, exQosLatencySum: 1.6, exQosCount: "2",
        },
      },
      {
        keys: ["lava@2def"],
        sum: {
          cu: "1000", relays: "500",
          qosSyncSum: 0.9, qosAvailSum: 0.9, qosLatencySum: 0.9, qosCount: "1", qosCu: "1000",
          exQosSyncSum: 0.8, exQosAvailSum: 0.8, exQosLatencySum: 0.8, exQosCount: "1",
        },
      },
    ],
  },
};

// groupBy=spec: keys=[chainId, provider]. Per-row sums already.
const MOCK_MV_SPEC = {
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
  (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_MV_PROVIDER);
  (fetchAllProviders as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_PROVIDERS);
});

describe("GET /provider-rewards (default groupBy=provider)", () => {
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
    expect(body.meta.groupBy).toBe("provider");
    expect(body.meta.totalAdjustedRewards).toBeGreaterThan(0);
    expect(body.data).toHaveLength(2);

    // AlphaProvider (2 specs, pooled) has higher total than BetaProvider (1 spec)
    const alpha = body.data[0];
    expect(alpha.provider).toBe("lava@1abc");
    expect(alpha.moniker).toBe("AlphaProvider");
    expect(body.data[1].provider).toBe("lava@2def");

    // QoS averages come from pooled sums ÷ pooled counts (1.8/2 = 0.9)
    expect(alpha.avgLatency).toBeCloseTo(0.9, 6);
    expect(alpha.avgAvailability).toBeCloseTo(0.9, 6);
    expect(alpha.avgSync).toBeCloseTo(0.9, 6);
    expect(alpha.avgLatencyExc).toBeCloseTo(0.8, 6);
    expect(alpha.avgAvailabilityExc).toBeCloseTo(0.8, 6);
    expect(alpha.avgSyncExc).toBeCloseTo(0.8, 6);
    expect(alpha.qosCus).toBe(2000);
    expect(alpha.cus).toBe(2000);
    expect(alpha.relays).toBe(1000);

    // No estimate fields
    expect(alpha.estimatedRewardsLava).toBeUndefined();
    expect(alpha.estimatedRewardsUsd).toBeUndefined();

    // No per-row spec field in provider mode
    expect(alpha.spec).toBeUndefined();
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

  it("pools chains before cbrt (Alpha is 2× Beta because QoS is identical and qosCus doubles)", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-rewards?from=2025-01-01&to=2025-04-01",
    });
    const body = JSON.parse(res.body);
    const alpha = body.data.find((p: { provider: string }) => p.provider === "lava@1abc");
    const beta = body.data.find((p: { provider: string }) => p.provider === "lava@2def");

    // adj = qosCus/2 + cbrt(avgLat·avgAvail·avgSync) · qosCus/2
    // Alpha: 2000/2 + 0.9 · 2000/2 = 1000 + 900 = 1900
    // Beta:  1000/2 + 0.9 · 1000/2 = 500 + 450 = 950
    expect(alpha.adjustedRewards).toBeCloseTo(1900, 6);
    expect(beta.adjustedRewards).toBeCloseTo(950, 6);
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
          keys: ["lava@1abc"],
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

describe("GET /provider-rewards?groupBy=spec", () => {
  beforeEach(() => {
    (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_MV_SPEC);
  });

  it("returns one row per (provider, spec)", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-rewards?from=2025-01-01&to=2025-04-01&groupBy=spec",
    });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.meta.groupBy).toBe("spec");
    expect(body.data).toHaveLength(3);

    for (const r of body.data) {
      expect(r.provider).toBeDefined();
      expect(r.spec).toBeDefined();
      expect(r.moniker).toBeDefined();
      expect(r.adjustedRewards).toBeGreaterThan(0);
    }
  });

  it("normalizes rewardShare within each spec (per-spec shares sum to 1)", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-rewards?from=2025-01-01&to=2025-04-01&groupBy=spec",
    });
    const body = JSON.parse(res.body);

    const shareBySpec = new Map<string, number>();
    for (const r of body.data) {
      shareBySpec.set(r.spec, (shareBySpec.get(r.spec) ?? 0) + r.rewardShare);
    }
    for (const [, totalShare] of shareBySpec) {
      expect(totalShare).toBeCloseTo(1.0, 10);
    }
  });

  it("exposes per-spec totals in meta.bySpec and grand total in meta.totalAdjustedRewards", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-rewards?from=2025-01-01&to=2025-04-01&groupBy=spec",
    });
    const body = JSON.parse(res.body);

    expect(body.meta.bySpec).toBeDefined();
    expect(body.meta.bySpec.ETH1).toBeGreaterThan(0);
    expect(body.meta.bySpec.NEAR).toBeGreaterThan(0);

    // Grand total equals sum of per-spec totals
    const sumOfSpecs = Object.values(body.meta.bySpec as Record<string, number>)
      .reduce((s, v) => s + v, 0);
    expect(body.meta.totalAdjustedRewards).toBeCloseTo(sumOfSpecs, 6);
  });

  it("sorts rows by spec then by adjustedRewards desc within each spec", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-rewards?from=2025-01-01&to=2025-04-01&groupBy=spec",
    });
    const body = JSON.parse(res.body);

    // ETH1 rows come before NEAR (alphabetical)
    const specsInOrder = body.data.map((r: { spec: string }) => r.spec);
    expect(specsInOrder[0]).toBe("ETH1");
    expect(specsInOrder[specsInOrder.length - 1]).toBe("NEAR");
  });
});
