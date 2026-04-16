import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { paginationPlugin } from "../plugins/pagination.js";
import { errorHandlerPlugin } from "../plugins/error-handler.js";

vi.mock("../rpc/lava.js", () => ({
  fetchAllProviders: vi.fn(),
  fetchDelegatorRewards: vi.fn(),
  prewarmPriceCache: vi.fn(),
  processClaimableRewards: vi.fn(),
}));

const {
  fetchAllProviders,
  fetchDelegatorRewards,
  prewarmPriceCache,
  processClaimableRewards,
} = await import("../rpc/lava.js");
const { providerClaimableRewardsRoutes } = await import("../routes/provider-claimable-rewards.js");

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(paginationPlugin);
  await app.register(providerClaimableRewardsRoutes);
  return app;
}

const MOCK_PROVIDERS = [
  { address: "lava@1abc", moniker: "Alpha", identity: "", totalStake: "0", totalDelegation: "0", commission: "50", specs: [] },
  { address: "lava@2def", moniker: "Beta", identity: "", totalStake: "0", totalDelegation: "0", commission: "30", specs: [] },
];

beforeEach(() => {
  vi.resetAllMocks();
  (prewarmPriceCache as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (fetchAllProviders as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_PROVIDERS);
  (fetchDelegatorRewards as ReturnType<typeof vi.fn>).mockImplementation((addr: string) => {
    if (addr === "lava@1abc") return Promise.resolve([{ denom: "ulava", amount: "5000000" }]);
    if (addr === "lava@2def") return Promise.resolve([]);
    return Promise.resolve([]);
  });
  (processClaimableRewards as ReturnType<typeof vi.fn>).mockImplementation(
    (rewards: Array<{ denom: string; amount: string }>, provider: string) => {
      if (rewards.length === 0) return Promise.resolve([]);
      return Promise.resolve([{
        amount: "5", denom: "lava", usdcValue: "10.0", provider,
      }]);
    },
  );
});

describe("GET /provider-claimable-rewards", () => {
  it("returns per-provider claimable rewards keyed by address", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/provider-claimable-rewards",
    });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.providers).toBeDefined();
    expect(body.providers["lava@1abc"]).toBeDefined();
    expect(body.providers["lava@1abc"].rewards).toHaveLength(1);
    expect(body.providers["lava@1abc"].rewards[0]).toMatchObject({
      amount: "5",
      denom: "lava",
      usdcValue: "10.0",
      provider: "lava@1abc",
    });
    expect(typeof body.providers["lava@1abc"].timestamp).toBe("string");

    // Beta had no rewards — should be omitted
    expect(body.providers["lava@2def"]).toBeUndefined();
  });

  it("calls prewarmPriceCache once before iterating providers", async () => {
    const app = await buildApp();
    await app.inject({ method: "GET", url: "/provider-claimable-rewards" });
    expect(prewarmPriceCache).toHaveBeenCalledTimes(1);
  });

  it("returns empty providers object when no providers are active", async () => {
    (fetchAllProviders as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/provider-claimable-rewards" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.providers).toEqual({});
  });
});
