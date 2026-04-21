import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { errorHandlerPlugin } from "../plugins/error-handler.js";

vi.mock("../rpc/lava.js", () => ({
  RPC_BATCH_SIZE: 5,
  prewarmPriceCache: vi.fn(),
  fetchAllSpecs: vi.fn(),
  fetchAllProviderMonikers: vi.fn(),
  fetchRawProviderRewards: vi.fn(),
  extractBaseDenoms: vi.fn(),
  processRawProviderRewards: vi.fn(),
  fetchBlockAtTimestamp: vi.fn(),
  fetchBlockTime: vi.fn(),
  fetchLavaUsdPrice: vi.fn(),
  buildHistoricalPriceMap: vi.fn(),
}));

vi.mock("../graphql/client.js", () => ({
  gqlSafe: vi.fn(),
}));

const {
  prewarmPriceCache,
  fetchAllSpecs,
  fetchAllProviderMonikers,
  fetchRawProviderRewards,
  extractBaseDenoms,
  processRawProviderRewards,
  fetchBlockAtTimestamp,
  fetchBlockTime,
  fetchLavaUsdPrice,
  buildHistoricalPriceMap,
} = await import("../rpc/lava.js");
const { gqlSafe } = await import("../graphql/client.js");
const { providerEstimatedRewardsRoutes } = await import("../routes/provider-estimated-rewards.js");

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(providerEstimatedRewardsRoutes);
  return app;
}

const MOCK_SPECS = [
  { index: "ETH1", name: "Ethereum Mainnet" },
  { index: "NEAR", name: "Near" },
];
const MOCK_MONIKERS = new Map([
  ["lava@1abc", "AlphaProvider"],
  ["lava@2def", "BetaProvider"],
]);
const MOCK_INDEXER_PROVIDERS = {
  allProviders: { nodes: [{ addr: "lava@1abc" }, { addr: "lava@2def" }] },
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

// Stub: raw response shape doesn't matter for routing since processRawProviderRewards is mocked.
const STUB_RAW = { info: [], total: [] };

beforeEach(() => {
  vi.resetAllMocks();
  (prewarmPriceCache as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (fetchLavaUsdPrice as ReturnType<typeof vi.fn>).mockResolvedValue(0.12);
  (fetchAllSpecs as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SPECS);
  (fetchAllProviderMonikers as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_MONIKERS);
  (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_INDEXER_PROVIDERS);
  (fetchRawProviderRewards as ReturnType<typeof vi.fn>).mockResolvedValue(STUB_RAW);
  (extractBaseDenoms as ReturnType<typeof vi.fn>).mockResolvedValue(new Set(["lava"]));
  (processRawProviderRewards as ReturnType<typeof vi.fn>).mockImplementation(
    (_raw: unknown, _specs: unknown, overrides: Record<string, number> | undefined) => {
      // Default mock returns Alpha/Beta per address — the route calls this
      // AFTER iterating rawByAddr (a Map) so we can't identify address here.
      // Tests that care about overrides can override this implementation.
      void overrides;
      return Promise.resolve(MOCK_REWARDS_ALPHA);
    },
  );
  (fetchBlockAtTimestamp as ReturnType<typeof vi.fn>).mockImplementation(
    (unix: number) => Promise.resolve(1_000_000 + Math.floor(unix / 1000)),
  );
  (fetchBlockTime as ReturnType<typeof vi.fn>).mockResolvedValue("2026-03-17T15:00:00Z");
  (buildHistoricalPriceMap as ReturnType<typeof vi.fn>).mockResolvedValue({ lava: 0.035 });
});

// Route calls processRawProviderRewards per-provider in Map iteration order.
// We key the mock by raw reference so Alpha and Beta can differ.
function mockProcessPerProvider() {
  const rawAlpha = { info: [{ source: "Boost: ETH1", amount: [{ denom: "ulava", amount: "5000000" }] }], total: [] };
  const rawBeta = { info: [{ source: "Boost: ETH1", amount: [{ denom: "ulava", amount: "2000000" }] }], total: [] };
  (fetchRawProviderRewards as ReturnType<typeof vi.fn>).mockImplementation((addr: string) => {
    if (addr === "lava@1abc") return Promise.resolve(rawAlpha);
    if (addr === "lava@2def") return Promise.resolve(rawBeta);
    return Promise.resolve(STUB_RAW);
  });
  (processRawProviderRewards as ReturnType<typeof vi.fn>).mockImplementation((raw: unknown) => {
    if (raw === rawAlpha) return Promise.resolve(MOCK_REWARDS_ALPHA);
    if (raw === rawBeta) return Promise.resolve(MOCK_REWARDS_BETA);
    return Promise.resolve([]);
  });
}

describe("GET /provider-estimated-rewards", () => {
  it("returns per-provider chain rewards grouped by spec", async () => {
    mockProcessPerProvider();
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-estimated-rewards" });
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
    mockProcessPerProvider();
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
    (processRawProviderRewards as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-estimated-rewards" });
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(0);
  });

  it("calls prewarmPriceCache before fetching rewards", async () => {
    const app = await buildApp();
    await app.inject({ method: "GET", url: "/provider-estimated-rewards" });
    expect(prewarmPriceCache).toHaveBeenCalledTimes(1);
  });

  it("batches provider RPC calls 5 at a time", async () => {
    const nodes = Array.from({ length: 12 }, (_, i) => ({ addr: `lava@p${i}` }));
    (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue({ allProviders: { nodes } });
    (fetchAllProviderMonikers as ReturnType<typeof vi.fn>).mockResolvedValue(new Map());
    (processRawProviderRewards as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const app = await buildApp();
    await app.inject({ method: "GET", url: "/provider-estimated-rewards" });
    expect(fetchRawProviderRewards).toHaveBeenCalledTimes(12);
  });

  it("passes block height through to fetchRawProviderRewards", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-estimated-rewards?block=1234567",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.meta.block).toBe(1234567);
    for (const [, blockArg] of (fetchRawProviderRewards as ReturnType<typeof vi.fn>).mock.calls) {
      expect(blockArg).toBe(1234567);
    }
  });

  it("for historical blocks, fetches prices only for denoms actually in rewards", async () => {
    (extractBaseDenoms as ReturnType<typeof vi.fn>).mockResolvedValue(new Set(["lava", "atom"]));
    // LAVA fetch (kicked off in parallel with fan-out) returns lava; the
    // follow-up non-LAVA fetch resolves the remaining denoms.
    (buildHistoricalPriceMap as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ lava: 0.035 })
      .mockResolvedValueOnce({ atom: 8.2 });

    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-estimated-rewards?block=4697952",
    });
    expect(res.statusCode).toBe(200);

    // Two calls total: ['lava'] upfront + any non-LAVA denoms after fan-out.
    // Never all 22 known denoms (that used to blow the gateway timeout).
    expect(buildHistoricalPriceMap).toHaveBeenCalledTimes(2);
    const first = (buildHistoricalPriceMap as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string[];
    expect(first).toEqual(["lava"]);
    const second = (buildHistoricalPriceMap as ReturnType<typeof vi.fn>).mock.calls[1]![1] as string[];
    expect(second).toEqual(["atom"]);

    // Merged price overrides passed down to processRawProviderRewards
    for (const call of (processRawProviderRewards as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[2]).toEqual({ lava: 0.035, atom: 8.2 });
    }
  });

  it("uses block-time pricing when ?block= is set (historical LAVA price)", async () => {
    (fetchBlockTime as ReturnType<typeof vi.fn>).mockResolvedValue("2026-03-17T15:00:00Z");
    (extractBaseDenoms as ReturnType<typeof vi.fn>).mockResolvedValue(new Set(["lava"]));
    (buildHistoricalPriceMap as ReturnType<typeof vi.fn>).mockResolvedValue({ lava: 0.035 });
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-estimated-rewards?block=4697952",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.meta.priceLavaUsd).toBe(0.035);
    expect(body.meta.priceTimestamp).toBe("2026-03-17T15:00:00Z");
    // fetchLavaUsdPrice NOT called when historical override provides LAVA
    expect(fetchLavaUsdPrice).not.toHaveBeenCalled();
  });

  it("uses the indexer's all-time provider list (includes unstaked historical providers)", async () => {
    // Indexer has a provider that isn't currently staked (no moniker). Route
    // should still query it at the historical block and render it with "-".
    (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue({
      allProviders: { nodes: [{ addr: "lava@1abc" }, { addr: "lava@2def" }, { addr: "lava@3ghost" }] },
    });
    mockProcessPerProvider();
    (fetchBlockTime as ReturnType<typeof vi.fn>).mockResolvedValue("2026-03-17T15:00:00Z");
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-estimated-rewards?block=4697952" });
    expect(res.statusCode).toBe(200);
    expect(fetchRawProviderRewards).toHaveBeenCalledTimes(3);
    const queriedAddrs = (fetchRawProviderRewards as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(queriedAddrs).toEqual(expect.arrayContaining(["lava@1abc", "lava@2def", "lava@3ghost"]));
  });

  it("uses live prices when ?block= is omitted", async () => {
    (fetchLavaUsdPrice as ReturnType<typeof vi.fn>).mockResolvedValue(0.025);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-estimated-rewards" });
    const body = JSON.parse(res.body);
    expect(body.meta.priceLavaUsd).toBe(0.025);
    expect(buildHistoricalPriceMap).not.toHaveBeenCalled();
    for (const call of (processRawProviderRewards as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[2]).toBeUndefined();
    }
  });

  it("returns 503 when historical LAVA price is unavailable (don't cache wrong data)", async () => {
    (fetchBlockTime as ReturnType<typeof vi.fn>).mockResolvedValue("2026-03-17T15:00:00Z");
    (extractBaseDenoms as ReturnType<typeof vi.fn>).mockResolvedValue(new Set(["lava"]));
    (buildHistoricalPriceMap as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("CoinGecko 429 after 5 attempts"),
    );
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-estimated-rewards?block=4697952",
    });
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).message).toMatch(/historical LAVA price unavailable/);
    // Critical: we must NOT have formatted rewards with wrong prices
    expect(processRawProviderRewards).not.toHaveBeenCalled();
  });

  it("filters response to a single spec when ?spec= is provided", async () => {
    mockProcessPerProvider();
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-estimated-rewards?spec=ETH1",
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.meta.spec).toBe("ETH1");
    expect(body.data).toHaveLength(2);
    for (const p of body.data) {
      for (const r of p.rewards) expect(r.spec).toBe("ETH1");
    }
    const alpha = body.data.find((p: { provider: string }) => p.provider === "lava@1abc");
    expect(alpha.total_usd).toBe(10);
  });

  it("?spec= is case-insensitive and uppercased in meta", async () => {
    mockProcessPerProvider();
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-estimated-rewards?spec=eth1",
    });
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
    mockProcessPerProvider();
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-estimated-rewards?spec=NEAR",
    });
    const body = JSON.parse(res.body);
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
    expect(body.data.length).toBeLessThan(4);
  });
});
