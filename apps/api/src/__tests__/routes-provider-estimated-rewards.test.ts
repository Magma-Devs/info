import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { paginationPlugin } from "../plugins/pagination.js";
import { errorHandlerPlugin } from "../plugins/error-handler.js";

vi.mock("../rpc/lava.js", () => ({
  prewarmPriceCache: vi.fn(),
  fetchProvidersWithSpecs: vi.fn(),
  fetchRewardsBySpec: vi.fn(),
}));

const { prewarmPriceCache, fetchProvidersWithSpecs, fetchRewardsBySpec } = await import("../rpc/lava.js");
const { providerEstimatedRewardsRoutes } = await import("../routes/provider-estimated-rewards.js");

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(paginationPlugin);
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

const MOCK_REWARDS_ALPHA = [
  {
    chain: "Ethereum Mainnet",
    spec: "ETH1",
    tokens: [{ source_denom: "ulava", resolved_amount: "5000000", resolved_denom: "ulava", display_denom: "lava", display_amount: "5", value_usd: "$10" }],
    total_usd: 10,
  },
  {
    chain: "Near",
    spec: "NEAR",
    tokens: [{ source_denom: "ulava", resolved_amount: "3000000", resolved_denom: "ulava", display_denom: "lava", display_amount: "3", value_usd: "$6" }],
    total_usd: 6,
  },
];

const MOCK_REWARDS_BETA = [
  {
    chain: "Ethereum Mainnet",
    spec: "ETH1",
    tokens: [{ source_denom: "ulava", resolved_amount: "2000000", resolved_denom: "ulava", display_denom: "lava", display_amount: "2", value_usd: "$4" }],
    total_usd: 4,
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  (prewarmPriceCache as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (fetchProvidersWithSpecs as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_PROVIDERS_WITH_SPECS);
  (fetchRewardsBySpec as ReturnType<typeof vi.fn>).mockImplementation((addr: string) => {
    if (addr === "lava@1abc") return Promise.resolve(MOCK_REWARDS_ALPHA);
    if (addr === "lava@2def") return Promise.resolve(MOCK_REWARDS_BETA);
    return Promise.resolve([]);
  });
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
    // Create 12 providers
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

    // 12 providers in batches of 5 → 12 individual calls but across 3 await rounds
    expect(fetchRewardsBySpec).toHaveBeenCalledTimes(12);
  });
});
