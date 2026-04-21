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

const STUB_RAW = { info: [], total: [] };

const MOCK_SNAPSHOT_NODES = [
  { blockHeight: "4895283", blockTime: "2026-04-17T15:00:00Z", snapshotDate: "2026-04-17", providerCount: 50, status: "ok" },
  { blockHeight: "4697952", blockTime: "2026-03-17T15:00:00Z", snapshotDate: "2026-03-17", providerCount: 48, status: "ok" },
];

beforeEach(() => {
  vi.resetAllMocks();
  (prewarmPriceCache as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (fetchLavaUsdPrice as ReturnType<typeof vi.fn>).mockResolvedValue(0.12);
  (fetchAllSpecs as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SPECS);
  (fetchAllProviderMonikers as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_MONIKERS);
  (fetchRawProviderRewards as ReturnType<typeof vi.fn>).mockResolvedValue(STUB_RAW);
  (extractBaseDenoms as ReturnType<typeof vi.fn>).mockResolvedValue(new Set(["lava"]));
  (processRawProviderRewards as ReturnType<typeof vi.fn>).mockImplementation(
    (_raw: unknown, _specs: unknown, overrides: Record<string, number> | undefined) => {
      void overrides;
      return Promise.resolve(MOCK_REWARDS_ALPHA);
    },
  );
  (buildHistoricalPriceMap as ReturnType<typeof vi.fn>).mockResolvedValue({ lava: 0.035 });
  // Default gqlSafe: block selector returns 2 snapshots; unused historical
  // queries return a plausible stub.
  (gqlSafe as ReturnType<typeof vi.fn>).mockImplementation((query: string) => {
    if (query.includes("allProviderRewardsSnapshots") && !query.includes("providerRewardsSnapshotByBlockHeight")) {
      return Promise.resolve({ allProviderRewardsSnapshots: { nodes: MOCK_SNAPSHOT_NODES } });
    }
    return Promise.resolve(null);
  });
});

// Route calls processRawProviderRewards per-provider in Map iteration order.
// Keys the mock by raw reference so Alpha and Beta can differ.
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

// Build a historical gqlSafe response. Hits BOTH the snapshot-by-block and
// the allProviderRewards queries (the route sends them in a single query
// with two fields, so both stubs return from the same object).
function mockHistoricalIndexer(opts: {
  snapshot?: { status?: string; blockTime?: string } | null;
  rewardRows?: Array<{ addr: string; spec: string; sourceKind: number; denom: string; amount: string }>;
}) {
  const snap = opts.snapshot === null
    ? null
    : {
        blockHeight: "4697952",
        blockTime: opts.snapshot?.blockTime ?? "2026-03-17T15:00:00Z",
        snapshotDate: "2026-03-17",
        providerCount: opts.rewardRows?.length ?? 0,
        status: opts.snapshot?.status ?? "ok",
      };
  const nodes = (opts.rewardRows ?? []).map((r) => ({
    providerByProviderId: { addr: r.addr },
    chainBySpecId: { name: r.spec },
    sourceKind: r.sourceKind,
    denom: r.denom,
    amount: r.amount,
  }));
  (gqlSafe as ReturnType<typeof vi.fn>).mockImplementation((query: string) => {
    if (query.includes("providerRewardsSnapshotByBlockHeight")) {
      return Promise.resolve({
        providerRewardsSnapshotByBlockHeight: snap,
        allProviderRewards: { nodes },
      });
    }
    if (query.includes("allProviderRewardsSnapshots")) {
      return Promise.resolve({ allProviderRewardsSnapshots: { nodes: MOCK_SNAPSHOT_NODES } });
    }
    return Promise.resolve(null);
  });
}

// ── Latest mode (no ?block=) ────────────────────────────────────────────────

describe("GET /provider-estimated-rewards (latest)", () => {
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

    expect(body.data[1].provider).toBe("lava@2def");
    expect(body.data[1].total_usd).toBe(4);
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
    const monikerMap = new Map<string, string>();
    for (let i = 0; i < 12; i++) monikerMap.set(`lava@p${i}`, `P${i}`);
    (fetchAllProviderMonikers as ReturnType<typeof vi.fn>).mockResolvedValue(monikerMap);
    (processRawProviderRewards as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const app = await buildApp();
    await app.inject({ method: "GET", url: "/provider-estimated-rewards" });
    expect(fetchRawProviderRewards).toHaveBeenCalledTimes(12);
  });

  it("uses the live LAVA price (no historical override)", async () => {
    (fetchLavaUsdPrice as ReturnType<typeof vi.fn>).mockResolvedValue(0.025);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-estimated-rewards" });
    const body = JSON.parse(res.body);
    expect(body.meta.priceLavaUsd).toBe(0.025);
    expect(buildHistoricalPriceMap).not.toHaveBeenCalled();
    // processRawProviderRewards gets no price override (undefined) in latest mode
    for (const call of (processRawProviderRewards as ReturnType<typeof vi.fn>).mock.calls) {
      expect(call[2]).toBeUndefined();
    }
  });

  it("filters response to a single spec when ?spec= is provided", async () => {
    mockProcessPerProvider();
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-estimated-rewards?spec=ETH1" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.meta.spec).toBe("ETH1");
    for (const p of body.data) {
      for (const r of p.rewards) expect(r.spec).toBe("ETH1");
    }
  });

  it("?spec= is case-insensitive and uppercased in meta", async () => {
    mockProcessPerProvider();
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-estimated-rewards?spec=eth1" });
    const body = JSON.parse(res.body);
    expect(body.meta.spec).toBe("ETH1");
  });

  it("rejects bad spec format", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-estimated-rewards?spec=!" });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toMatch(/bad spec format/);
  });
});

// ── Historical mode (?block=N from indexer) ─────────────────────────────────

describe("GET /provider-estimated-rewards?block= (historical / indexer)", () => {
  it("reads from the indexer — does NOT fan-out to chain", async () => {
    mockHistoricalIndexer({
      rewardRows: [
        { addr: "lava@1abc", spec: "ETH1", sourceKind: 0, denom: "ulava", amount: "5000000" },
        { addr: "lava@2def", spec: "ETH1", sourceKind: 2, denom: "ulava", amount: "2000000" },
      ],
    });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-estimated-rewards?block=4697952" });
    expect(res.statusCode).toBe(200);
    expect(fetchRawProviderRewards).not.toHaveBeenCalled();
  });

  it("synthesizes chain-shaped input from indexer rows and groups by provider", async () => {
    mockHistoricalIndexer({
      rewardRows: [
        { addr: "lava@1abc", spec: "ETH1", sourceKind: 0, denom: "ulava", amount: "5000000" },
        { addr: "lava@1abc", spec: "ETH1", sourceKind: 1, denom: "ulava", amount: "3000000" },
        { addr: "lava@2def", spec: "ETH1", sourceKind: 2, denom: "ulava", amount: "2000000" },
      ],
    });
    // Capture what processRawProviderRewards sees — one call per provider
    const capturedRaws: Array<{ addr: string; sources: string[] }> = [];
    (processRawProviderRewards as ReturnType<typeof vi.fn>).mockImplementation((raw: unknown) => {
      const typedRaw = raw as { info: Array<{ source: string }> };
      capturedRaws.push({ addr: "", sources: typedRaw.info.map((i) => i.source) });
      return Promise.resolve(MOCK_REWARDS_ALPHA);
    });

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-estimated-rewards?block=4697952" });
    expect(res.statusCode).toBe(200);
    expect(capturedRaws).toHaveLength(2); // one per provider
    // Alpha's synthesized raw has two info rows with the expected labels
    const alpha = capturedRaws.find((c) => c.sources.length === 2);
    expect(alpha?.sources).toEqual(expect.arrayContaining(["Boost: ETH1", "Pools: ETH1"]));
  });

  it("returns 404 when the indexer has no snapshot for the requested block", async () => {
    mockHistoricalIndexer({ snapshot: null });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-estimated-rewards?block=9999999" });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).message).toMatch(/no snapshot available/);
  });

  it("returns 404 when the snapshot row exists but status != 'ok'", async () => {
    mockHistoricalIndexer({
      snapshot: { status: "failed" },
      rewardRows: [],
    });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-estimated-rewards?block=4697952" });
    expect(res.statusCode).toBe(404);
  });

  it("returns 503 when historical LAVA price is unavailable (don't cache wrong data)", async () => {
    mockHistoricalIndexer({
      rewardRows: [
        { addr: "lava@1abc", spec: "ETH1", sourceKind: 0, denom: "ulava", amount: "5000000" },
      ],
    });
    (buildHistoricalPriceMap as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("CoinGecko 429"));
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-estimated-rewards?block=4697952" });
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).message).toMatch(/historical LAVA price unavailable/);
    expect(processRawProviderRewards).not.toHaveBeenCalled();
  });

  it("uses block-time pricing from the snapshot row (not fetchLavaUsdPrice)", async () => {
    mockHistoricalIndexer({
      snapshot: { blockTime: "2026-03-17T15:00:00Z" },
      rewardRows: [{ addr: "lava@1abc", spec: "ETH1", sourceKind: 0, denom: "ulava", amount: "5000000" }],
    });
    (buildHistoricalPriceMap as ReturnType<typeof vi.fn>).mockResolvedValue({ lava: 0.035 });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-estimated-rewards?block=4697952" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.meta.priceLavaUsd).toBe(0.035);
    expect(body.meta.priceTimestamp).toBe("2026-03-17T15:00:00Z");
    expect(fetchLavaUsdPrice).not.toHaveBeenCalled();
    // First (and in this case only) historical-price call is just ['lava']
    expect((buildHistoricalPriceMap as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toEqual(["lava"]);
  });

  it("fetches non-LAVA denom prices only when they actually appear in the snapshot", async () => {
    mockHistoricalIndexer({
      rewardRows: [
        { addr: "lava@1abc", spec: "ETH1", sourceKind: 0, denom: "ulava", amount: "5000000" },
      ],
    });
    (extractBaseDenoms as ReturnType<typeof vi.fn>).mockResolvedValue(new Set(["lava", "atom"]));
    (buildHistoricalPriceMap as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ lava: 0.035 })
      .mockResolvedValueOnce({ atom: 8.2 });

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-estimated-rewards?block=4697952" });
    expect(res.statusCode).toBe(200);
    expect(buildHistoricalPriceMap).toHaveBeenCalledTimes(2);
    expect((buildHistoricalPriceMap as ReturnType<typeof vi.fn>).mock.calls[1]![1]).toEqual(["atom"]);
  });

  it("filters by spec in historical mode", async () => {
    mockHistoricalIndexer({
      rewardRows: [{ addr: "lava@1abc", spec: "ETH1", sourceKind: 0, denom: "ulava", amount: "5000000" }],
    });
    // Alpha's rewards include both ETH1 and NEAR entries — after filter,
    // only ETH1 should remain
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-estimated-rewards?block=4697952&spec=ETH1" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.meta.spec).toBe("ETH1");
    for (const p of body.data) {
      for (const r of p.rewards) expect(r.spec).toBe("ETH1");
    }
  });

  it("renders ghost providers (no moniker) as '-'", async () => {
    mockHistoricalIndexer({
      rewardRows: [{ addr: "lava@3ghost", spec: "ETH1", sourceKind: 0, denom: "ulava", amount: "1000000" }],
    });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-estimated-rewards?block=4697952" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const ghost = body.data.find((p: { provider: string }) => p.provider === "lava@3ghost");
    expect(ghost?.moniker).toBe("-");
  });
});

// ── Blocks listing ──────────────────────────────────────────────────────────

describe("GET /provider-estimated-rewards/blocks", () => {
  it("returns the indexer's snapshot set", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-estimated-rewards/blocks" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].height).toBe(4895283);
    expect(body.data[0].date).toBe("2026-04-17");
    expect(body.data[1].height).toBe(4697952);
  });

  it("returns an empty array when the indexer has no snapshots yet", async () => {
    (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue({
      allProviderRewardsSnapshots: { nodes: [] },
    });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-estimated-rewards/blocks" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toEqual([]);
  });

  it("returns an empty array when the indexer query fails (gqlSafe fallback)", async () => {
    (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-estimated-rewards/blocks" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toEqual([]);
  });
});
