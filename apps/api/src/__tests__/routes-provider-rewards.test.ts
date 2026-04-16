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
  fetchLavaUsdPrice: vi.fn(),
  fetchLavaUsdPriceAt: vi.fn(),
  fetchProviderRewardPoolsAmount: vi.fn(),
}));

const { gqlSafe } = await import("../graphql/client.js");
const { fetchAllProviders, fetchLavaUsdPrice, fetchLavaUsdPriceAt, fetchProviderRewardPoolsAmount } = await import("../rpc/lava.js");
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
          qosSyncW: 0.9, qosAvailW: 0.9, qosLatencyW: 0.9, qosWeight: "1",
        },
      },
      {
        keys: ["NEAR", "lava@1abc"],
        sum: {
          cu: "1000", relays: "500",
          qosSyncW: 0.9, qosAvailW: 0.9, qosLatencyW: 0.9, qosWeight: "1",
        },
      },
      {
        keys: ["ETH1", "lava@2def"],
        sum: {
          cu: "1000", relays: "500",
          qosSyncW: 0.9, qosAvailW: 0.9, qosLatencyW: 0.9, qosWeight: "1",
        },
      },
    ],
  },
};

const MOCK_PROVIDERS = [
  { address: "lava@1abc", moniker: "AlphaProvider" },
  { address: "lava@2def", moniker: "BetaProvider" },
];

// 100,000 LAVA = 100_000_000_000 ulava
const MOCK_PROVIDER_POOL_ULAVA = 100_000_000_000n;

beforeEach(() => {
  vi.resetAllMocks();
  (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_MV_RESPONSE);
  (fetchAllProviders as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_PROVIDERS);
  (fetchLavaUsdPrice as ReturnType<typeof vi.fn>).mockResolvedValue(0.05);
  (fetchLavaUsdPriceAt as ReturnType<typeof vi.fn>).mockResolvedValue(0.04);
  (fetchProviderRewardPoolsAmount as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_PROVIDER_POOL_ULAVA);
});

describe("GET /provider-rewards", () => {
  it("returns provider reward distribution with USD values", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-rewards?from=2025-01-01&to=2025-04-01",
    });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.meta.from).toBe("2025-01-01");
    expect(body.meta.to).toBe("2025-04-01");
    expect(body.meta.lavaUsdPrice).toBeDefined();
    expect(body.meta.providerPoolLava).toBe(100_000); // 100B ulava = 100k LAVA
    expect(body.meta.totalAdjustedRewards).toBeGreaterThan(0);
    expect(body.data).toHaveLength(2);

    // AlphaProvider has 2 specs, BetaProvider has 1 — Alpha should have higher total
    expect(body.data[0].provider).toBe("lava@1abc");
    expect(body.data[0].moniker).toBe("AlphaProvider");
    expect(body.data[1].provider).toBe("lava@2def");

    // estimatedRewardsUsd = share × poolLava × lavaPrice (historical price = 0.04)
    const alpha = body.data[0];
    expect(alpha.estimatedRewardsLava).toBeCloseTo(alpha.rewardShare * 100_000, 6);
    expect(alpha.estimatedRewardsUsd).toBeCloseTo(alpha.rewardShare * 100_000 * 0.04, 6);
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

  it("uses historical price for past date ranges", async () => {
    const app = await buildApp();
    await app.inject({
      method: "GET",
      url: "/provider-rewards?from=2024-01-01&to=2024-04-01",
    });
    expect(fetchLavaUsdPriceAt).toHaveBeenCalled();
    expect(fetchLavaUsdPrice).not.toHaveBeenCalled();
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

  it("returns null lavaUsdPrice when CoinGecko fails", async () => {
    (fetchLavaUsdPrice as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("CoinGecko down"),
    );
    (fetchLavaUsdPriceAt as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("CoinGecko down"),
    );
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-rewards?from=2025-01-01&to=2025-04-01",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.meta.lavaUsdPrice).toBeNull();
    expect(body.data).toHaveLength(2);
    expect(body.data[0].estimatedRewardsUsd).toBeNull();
    // LAVA estimate still works even without USD price
    expect(body.data[0].estimatedRewardsLava).not.toBeNull();
  });

  it("returns null estimates when reward pool fetch fails", async () => {
    (fetchProviderRewardPoolsAmount as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("RPC down"),
    );
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-rewards?from=2025-01-01&to=2025-04-01",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.meta.providerPoolLava).toBeNull();
    expect(body.data[0].estimatedRewardsLava).toBeNull();
    expect(body.data[0].estimatedRewardsUsd).toBeNull();
  });

  it("returns zero adjusted rewards when qosWeight is zero", async () => {
    const zeroWeightMv = {
      mvRelayDailies: {
        groupedAggregates: [{
          keys: ["ETH1", "lava@1abc"],
          sum: {
            cu: "1000", relays: "500",
            qosSyncW: null, qosAvailW: null, qosLatencyW: null, qosWeight: "0",
          },
        }],
      },
    };
    (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue(zeroWeightMv);
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-rewards?from=2025-01-01&to=2025-04-01",
    });
    const body = JSON.parse(res.body);
    expect(body.data[0].adjustedRewards).toBe(0);
  });
});
