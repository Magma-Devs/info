import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { errorHandlerPlugin } from "../plugins/error-handler.js";

vi.mock("../rpc/lava.js", () => ({
  RPC_BATCH_SIZE: 5,
  prewarmPriceCache: vi.fn(),
  fetchProvidersWithSpecs: vi.fn(),
  fetchRewardsBySpec: vi.fn(),
  fetchBlockAtTimestamp: vi.fn(),
  fetchBlockTime: vi.fn(),
  fetchLavaUsdPrice: vi.fn(),
  buildHistoricalPriceMap: vi.fn(),
}));

const {
  prewarmPriceCache,
  fetchProvidersWithSpecs,
  fetchRewardsBySpec,
  fetchBlockAtTimestamp,
  fetchBlockTime,
  fetchLavaUsdPrice,
  buildHistoricalPriceMap,
} = await import("../rpc/lava.js");
const { providerEstimatedRewardsRoutes } = await import("../routes/provider-estimated-rewards.js");

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(providerEstimatedRewardsRoutes);
  return app;
}

const MOCK_PROVIDERS_WITH_SPECS = {
  providers: new Map([
    ["lava@1abc", { moniker: "AlphaProvider", identity: "", commission: "50", specs: [] }],
    ["lava@2def", { moniker: "BetaProvider", identity: "", commission: "30", specs: [] }],
  ]),
  specNames: new Map([["ETH1", "Ethereum Mainnet"], ["NEAR", "Near"]]),
};

const TOK = (amount: string, usd: string) => ({
  source_denom: "ulava", resolved_amount: `${parseFloat(amount) * 1_000_000}`,
  resolved_denom: "ulava", display_denom: "lava", display_amount: amount, value_usd: usd,
});

const MOCK_REWARDS_ALPHA = [
  {
    chain: "Ethereum Mainnet",
    spec: "ETH1",
    tokens: [TOK("5", "$10")],
    total_usd: 10,
    sources: [
      { source: "Boost: ETH1", tokens: [TOK("2", "$4")], total_usd: 4 },
      { source: "Pools: ETH1", tokens: [TOK("1", "$2")], total_usd: 2 },
      { source: "Subscription: ETH1", tokens: [TOK("2", "$4")], total_usd: 4 },
    ],
  },
  {
    chain: "Near",
    spec: "NEAR",
    tokens: [TOK("3", "$6")],
    total_usd: 6,
    sources: [
      { source: "Boost: NEAR", tokens: [TOK("3", "$6")], total_usd: 6 },
    ],
  },
];

const MOCK_REWARDS_BETA = [
  {
    chain: "Ethereum Mainnet",
    spec: "ETH1",
    tokens: [TOK("2", "$4")],
    total_usd: 4,
    sources: [
      { source: "Subscription: ETH1", tokens: [TOK("2", "$4")], total_usd: 4 },
    ],
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  (prewarmPriceCache as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (fetchLavaUsdPrice as ReturnType<typeof vi.fn>).mockResolvedValue(0.12);
  (fetchProvidersWithSpecs as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_PROVIDERS_WITH_SPECS);
  (fetchRewardsBySpec as ReturnType<typeof vi.fn>).mockImplementation((addr: string) => {
    if (addr === "lava@1abc") return Promise.resolve(MOCK_REWARDS_ALPHA);
    if (addr === "lava@2def") return Promise.resolve(MOCK_REWARDS_BETA);
    return Promise.resolve([]);
  });
  (fetchBlockAtTimestamp as ReturnType<typeof vi.fn>).mockImplementation(
    (unix: number) => Promise.resolve(1_000_000 + Math.floor(unix / 1000)),
  );
  (fetchBlockTime as ReturnType<typeof vi.fn>).mockResolvedValue("2026-03-17T15:00:00Z");
  (buildHistoricalPriceMap as ReturnType<typeof vi.fn>).mockResolvedValue({ lava: 0.035 });
});

describe("GET /provider-estimated-rewards", () => {
  it("returns per-provider chain rewards grouped by spec", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-estimated-rewards",
    });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.meta.block).toBeNull();
    expect(body.meta.spec).toBeNull();
    expect(body.data).toHaveLength(2);

    // Sorted by total_usd descending — Alpha ($16) before Beta ($4)
    expect(body.data[0].provider).toBe("lava@1abc");
    expect(body.data[0].moniker).toBe("AlphaProvider");
    expect(body.data[0].total_usd).toBe(16);
    expect(body.data[0].rewards).toHaveLength(2);

    expect(body.data[1].provider).toBe("lava@2def");
    expect(body.data[1].total_usd).toBe(4);
    expect(body.data[1].rewards).toHaveLength(1);
  });

  it("preserves per-source breakdown on each spec entry", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-estimated-rewards" });
    const body = JSON.parse(res.body);
    const alpha = body.data.find((p: { provider: string }) => p.provider === "lava@1abc");
    const eth1 = alpha.rewards.find((r: { spec: string }) => r.spec === "ETH1");
    expect(eth1.sources).toHaveLength(3);
    const sourceSum = eth1.sources.reduce((s: number, x: { total_usd: number }) => s + x.total_usd, 0);
    expect(sourceSum).toBe(eth1.total_usd);
    expect(eth1.sources.map((s: { source: string }) => s.source)).toEqual(
      expect.arrayContaining(["Boost: ETH1", "Pools: ETH1", "Subscription: ETH1"]),
    );
  });

  it("excludes providers with no rewards", async () => {
    (fetchRewardsBySpec as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-estimated-rewards",
    });
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(0);
  });

  it("calls prewarmPriceCache before fetching rewards", async () => {
    const app = await buildApp();
    await app.inject({
      method: "GET",
      url: "/provider-estimated-rewards",
    });
    expect(prewarmPriceCache).toHaveBeenCalledTimes(1);
  });

  it("batches provider RPC calls 5 at a time", async () => {
    const providers = new Map<string, { moniker: string; identity: string; commission: string; specs: never[] }>();
    for (let i = 0; i < 12; i++) {
      providers.set(`lava@p${i}`, { moniker: `P${i}`, identity: "", commission: "50", specs: [] });
    }
    (fetchProvidersWithSpecs as ReturnType<typeof vi.fn>).mockResolvedValue({
      providers,
      specNames: new Map(),
    });
    (fetchRewardsBySpec as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const app = await buildApp();
    await app.inject({
      method: "GET",
      url: "/provider-estimated-rewards",
    });

    expect(fetchRewardsBySpec).toHaveBeenCalledTimes(12);
  });

  it("passes block height through to fetchRewardsBySpec", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-estimated-rewards?block=1234567",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.meta.block).toBe(1234567);

    // Every call should have been made with block=1234567 as the third arg
    const calls = (fetchRewardsBySpec as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const [, , blockArg] of calls) {
      expect(blockArg).toBe(1234567);
    }
  });

  it("uses block-time pricing when ?block= is set (historical LAVA price)", async () => {
    (fetchBlockTime as ReturnType<typeof vi.fn>).mockResolvedValue("2026-03-17T15:00:00Z");
    (buildHistoricalPriceMap as ReturnType<typeof vi.fn>).mockResolvedValue({ lava: 0.035 });
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-estimated-rewards?block=4697952",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // meta.priceLavaUsd reflects historical price, meta.priceTimestamp = block time
    expect(body.meta.priceLavaUsd).toBe(0.035);
    expect(body.meta.priceTimestamp).toBe("2026-03-17T15:00:00Z");
    // fetchRewardsBySpec got the override map as the 4th arg
    const calls = (fetchRewardsBySpec as ReturnType<typeof vi.fn>).mock.calls;
    for (const [, , , overridesArg] of calls) {
      expect(overridesArg).toEqual({ lava: 0.035 });
    }
    // fetchLavaUsdPrice is NOT called when historical overrides provide a lava price
    expect(fetchLavaUsdPrice).not.toHaveBeenCalled();
  });

  it("snapshots the provider set at the historical block (not current)", async () => {
    (fetchBlockTime as ReturnType<typeof vi.fn>).mockResolvedValue("2026-03-17T15:00:00Z");
    (buildHistoricalPriceMap as ReturnType<typeof vi.fn>).mockResolvedValue({ lava: 0.035 });
    const app = await buildApp();
    await app.inject({ method: "GET", url: "/provider-estimated-rewards?block=4697952" });
    // fetchProvidersWithSpecs was called with the block height so chain RPC
    // returns the provider set as it existed at that block (includes providers
    // who have since deregistered).
    expect(fetchProvidersWithSpecs).toHaveBeenCalledWith(4697952);
  });

  it("uses live prices + current provider set when ?block= is omitted", async () => {
    (fetchLavaUsdPrice as ReturnType<typeof vi.fn>).mockResolvedValue(0.025);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-estimated-rewards" });
    const body = JSON.parse(res.body);
    expect(body.meta.priceLavaUsd).toBe(0.025);
    // Provider set fetched without a block arg (current state)
    expect(fetchProvidersWithSpecs).toHaveBeenCalledWith(undefined);
    // No historical price map needed
    expect(buildHistoricalPriceMap).not.toHaveBeenCalled();
    // No override passed through to fetchRewardsBySpec
    const calls = (fetchRewardsBySpec as ReturnType<typeof vi.fn>).mock.calls;
    for (const [, , , overridesArg] of calls) {
      expect(overridesArg).toBeUndefined();
    }
  });

  it("filters response to a single spec when ?spec= is provided", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-estimated-rewards?spec=ETH1",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.meta.spec).toBe("ETH1");

    // Both providers have ETH1 entries
    expect(body.data).toHaveLength(2);
    for (const p of body.data) {
      for (const r of p.rewards) {
        expect(r.spec).toBe("ETH1");
      }
    }

    // Alpha's total_usd drops from 16 → 10 (NEAR portion dropped)
    const alpha = body.data.find((p: { provider: string }) => p.provider === "lava@1abc");
    expect(alpha.total_usd).toBe(10);
  });

  it("?spec= is case-insensitive and uppercased in meta", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-estimated-rewards?spec=eth1",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.meta.spec).toBe("ETH1");
    expect(body.data).toHaveLength(2);
  });

  it("rejects bad spec format", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-estimated-rewards?spec=!",
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toMatch(/bad spec format/);
  });

  it("excludes providers whose filtered rewards become empty", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-estimated-rewards?spec=NEAR",
    });
    const body = JSON.parse(res.body);
    // Only Alpha has NEAR rewards
    expect(body.data).toHaveLength(1);
    expect(body.data[0].provider).toBe("lava@1abc");
    expect(body.data[0].rewards).toHaveLength(1);
    expect(body.data[0].rewards[0].spec).toBe("NEAR");
  });
});

describe("GET /provider-estimated-rewards/blocks", () => {
  it("returns a list of monthly snapshot blocks", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-estimated-rewards/blocks",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.length).toBeLessThanOrEqual(12);

    for (const b of body.data) {
      expect(typeof b.height).toBe("number");
      expect(typeof b.time).toBe("string");
      expect(typeof b.date).toBe("string");
      // Date is the 17th of some month
      expect(b.date).toMatch(/^\d{4}-\d{2}-17$/);
    }
  });

  it("honors ?count=N", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-estimated-rewards/blocks?count=3",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(3);
  });

  it("skips entries where block resolution fails", async () => {
    (fetchBlockAtTimestamp as ReturnType<typeof vi.fn>).mockImplementation((unix: number) => {
      // Fail every other lookup
      if (unix % 2 === 0) return Promise.reject(new Error("rpc error"));
      return Promise.resolve(1_000_000);
    });
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-estimated-rewards/blocks?count=4",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // Shouldn't have 4; some were filtered
    expect(body.data.length).toBeLessThan(4);
  });
});
