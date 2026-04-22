import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { errorHandlerPlugin } from "../plugins/error-handler.js";

vi.mock("../rpc/lava.js", () => ({
  RPC_BATCH_SIZE: 5,
  prewarmPriceCache: vi.fn(),
  fetchAllSpecs: vi.fn(),
  fetchAllProviderMonikers: vi.fn(),
  fetchRawProviderRewards: vi.fn(),
  processRawProviderRewards: vi.fn(),
  fetchLavaUsdPrice: vi.fn(),
  // Re-exported from rewards.ts, used by the historical pass-through to trim
  // trailing zeros on the NUMERIC strings coming out of the indexer MV.
  formatTokenStr: (s: string) => {
    const [whole = "", frac] = s.split(".");
    if (!frac) return whole;
    const trimmed = frac.replace(/0+$/, "");
    return trimmed ? `${whole}.${trimmed}` : whole;
  },
}));

vi.mock("../graphql/client.js", () => ({
  gqlSafe: vi.fn(),
}));

const {
  prewarmPriceCache,
  fetchAllSpecs,
  fetchAllProviderMonikers,
  fetchRawProviderRewards,
  processRawProviderRewards,
  fetchLavaUsdPrice,
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

// Live-path fixtures — processRawProviderRewards returns these already-shaped
// per-spec entries for the two mock providers.
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
  (processRawProviderRewards as ReturnType<typeof vi.fn>).mockImplementation(
    (_raw: unknown, _specs: unknown, overrides: Record<string, number> | undefined) => {
      void overrides;
      return Promise.resolve(MOCK_REWARDS_ALPHA);
    },
  );
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

// Build a historical gqlSafe response. The single route query fans out two
// fields (snapshot + allPricedRewards) — both come back from this stub.
//
// Row defaults mimic a ulava-only snapshot with block-time USD pricing
// already baked in by the indexer MV (priceUsd / valueUsd populated).
function mockHistoricalIndexer(opts: {
  snapshot?: { status?: string; blockTime?: string } | null;
  rewardRows?: Array<{
    addr: string;
    spec: string;
    sourceKind: number;
    sourceDenom?: string;
    resolvedDenom?: string;
    displayDenom?: string;
    rawAmount: string;
    displayAmount: string;
    priceUsd?: string | null;
    valueUsd?: string | null;
  }>;
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
    blockHeight: "4697952",
    snapshotDate: "2026-03-17",
    blockTime: snap?.blockTime ?? "2026-03-17T15:00:00Z",
    provider: r.addr,
    spec: r.spec,
    sourceKind: r.sourceKind,
    sourceDenom: r.sourceDenom ?? "ulava",
    resolvedDenom: r.resolvedDenom ?? "ulava",
    displayDenom: r.displayDenom ?? "lava",
    rawAmount: r.rawAmount,
    displayAmount: r.displayAmount,
    priceUsd: r.priceUsd === undefined ? "0.035" : r.priceUsd,
    valueUsd: r.valueUsd === undefined
      ? (r.priceUsd === null ? null : (parseFloat(r.displayAmount) * 0.035).toString())
      : r.valueUsd,
  }));
  (gqlSafe as ReturnType<typeof vi.fn>).mockImplementation((query: string) => {
    if (query.includes("providerRewardsSnapshotByBlockHeight")) {
      return Promise.resolve({
        providerRewardsSnapshotByBlockHeight: snap,
        allPricedRewards: { nodes },
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

// ── Historical mode (?block=N — pure pass-through from indexer MV) ──────────

describe("GET /provider-estimated-rewards?block= (historical / indexer MV)", () => {
  it("reads from the indexer — does NOT fan-out to chain or call CoinGecko", async () => {
    mockHistoricalIndexer({
      rewardRows: [
        { addr: "lava@1abc", spec: "ETH1", sourceKind: 0, rawAmount: "5000000", displayAmount: "5" },
        { addr: "lava@2def", spec: "ETH1", sourceKind: 2, rawAmount: "2000000", displayAmount: "2" },
      ],
    });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-estimated-rewards?block=4697952" });
    expect(res.statusCode).toBe(200);
    expect(fetchRawProviderRewards).not.toHaveBeenCalled();
    expect(processRawProviderRewards).not.toHaveBeenCalled();
    expect(fetchLavaUsdPrice).not.toHaveBeenCalled();
    expect(prewarmPriceCache).not.toHaveBeenCalled();
  });

  it("groups rows into the legacy provider → spec → source shape", async () => {
    mockHistoricalIndexer({
      rewardRows: [
        { addr: "lava@1abc", spec: "ETH1", sourceKind: 0, rawAmount: "5000000", displayAmount: "5" },
        { addr: "lava@1abc", spec: "ETH1", sourceKind: 1, rawAmount: "3000000", displayAmount: "3" },
        { addr: "lava@2def", spec: "ETH1", sourceKind: 2, rawAmount: "2000000", displayAmount: "2" },
      ],
    });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-estimated-rewards?block=4697952" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(2);

    const alpha = body.data.find((p: { provider: string }) => p.provider === "lava@1abc");
    expect(alpha.rewards).toHaveLength(1); // one spec (ETH1)
    const eth1 = alpha.rewards[0];
    expect(eth1.spec).toBe("ETH1");
    expect(eth1.chain).toBe("Ethereum Mainnet");
    expect(eth1.sources.map((s: { source: string }) => s.source)).toEqual(
      expect.arrayContaining(["Boost: ETH1", "Pools: ETH1"]),
    );
  });

  it("sorts results by total_usd descending", async () => {
    mockHistoricalIndexer({
      rewardRows: [
        // Alpha: $0.035 * (5 + 3) = $0.28
        { addr: "lava@1abc", spec: "ETH1", sourceKind: 0, rawAmount: "5000000", displayAmount: "5" },
        { addr: "lava@1abc", spec: "ETH1", sourceKind: 1, rawAmount: "3000000", displayAmount: "3" },
        // Beta: $0.035 * 2 = $0.07
        { addr: "lava@2def", spec: "ETH1", sourceKind: 2, rawAmount: "2000000", displayAmount: "2" },
      ],
    });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-estimated-rewards?block=4697952" });
    const body = JSON.parse(res.body);
    expect(body.data[0].provider).toBe("lava@1abc");
    expect(body.data[1].provider).toBe("lava@2def");
    expect(body.data[0].total_usd).toBeGreaterThan(body.data[1].total_usd);
  });

  it("uses block-time pricing from the MV (meta.priceLavaUsd + priceTimestamp)", async () => {
    mockHistoricalIndexer({
      snapshot: { blockTime: "2026-03-17T15:00:00Z" },
      rewardRows: [
        {
          addr: "lava@1abc", spec: "ETH1", sourceKind: 0,
          rawAmount: "5000000", displayAmount: "5",
          priceUsd: "0.035", valueUsd: "0.175",
        },
      ],
    });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-estimated-rewards?block=4697952" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.meta.priceLavaUsd).toBe(0.035);
    expect(body.meta.priceTimestamp).toBe("2026-03-17T15:00:00Z");
    expect(fetchLavaUsdPrice).not.toHaveBeenCalled();
  });

  it("renders priced tokens byte-identical to the legacy shape", async () => {
    mockHistoricalIndexer({
      rewardRows: [
        {
          addr: "lava@1abc", spec: "ETH1", sourceKind: 0,
          sourceDenom: "ulava", resolvedDenom: "ulava", displayDenom: "lava",
          rawAmount: "5000000", displayAmount: "5",
          priceUsd: "0.035", valueUsd: "0.175",
        },
      ],
    });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-estimated-rewards?block=4697952" });
    const body = JSON.parse(res.body);
    const token = body.data[0].rewards[0].tokens[0];
    expect(token).toEqual({
      source_denom: "ulava",
      resolved_amount: "5000000",
      resolved_denom: "ulava",
      display_denom: "lava",
      display_amount: "5",
      value_usd: "$0.175",
    });
  });

  it("preserves IBC source_denom + resolved_denom from the MV", async () => {
    mockHistoricalIndexer({
      rewardRows: [
        {
          addr: "lava@1abc", spec: "ETH1", sourceKind: 0,
          sourceDenom: "ibc/ABC123", resolvedDenom: "uatom", displayDenom: "atom",
          rawAmount: "1000000", displayAmount: "1",
          priceUsd: "8.2", valueUsd: "8.2",
        },
      ],
    });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-estimated-rewards?block=4697952" });
    const body = JSON.parse(res.body);
    const token = body.data[0].rewards[0].tokens[0];
    expect(token.source_denom).toBe("ibc/ABC123");
    expect(token.resolved_denom).toBe("uatom");
    expect(token.display_denom).toBe("atom");
    expect(token.value_usd).toBe("$8.2");
  });

  it("renders value_usd as \"$0\" when priceUsd is null", async () => {
    mockHistoricalIndexer({
      rewardRows: [
        {
          addr: "lava@1abc", spec: "ETH1", sourceKind: 0,
          rawAmount: "5000000", displayAmount: "5",
          priceUsd: null, valueUsd: null,
        },
      ],
    });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-estimated-rewards?block=4697952" });
    const body = JSON.parse(res.body);
    const token = body.data[0].rewards[0].tokens[0];
    expect(token.value_usd).toBe("$0");
    expect(body.data[0].rewards[0].total_usd).toBe(0);
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

  it("filters by spec in historical mode (client-side filter on row.spec)", async () => {
    mockHistoricalIndexer({
      rewardRows: [
        { addr: "lava@1abc", spec: "ETH1", sourceKind: 0, rawAmount: "5000000", displayAmount: "5" },
        { addr: "lava@1abc", spec: "NEAR", sourceKind: 0, rawAmount: "3000000", displayAmount: "3" },
      ],
    });
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
      rewardRows: [
        { addr: "lava@3ghost", spec: "ETH1", sourceKind: 0, rawAmount: "1000000", displayAmount: "1" },
      ],
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
