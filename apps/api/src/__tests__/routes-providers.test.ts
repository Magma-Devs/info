import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { paginationPlugin } from "../plugins/pagination.js";
import { errorHandlerPlugin } from "../plugins/error-handler.js";

vi.mock("../graphql/client.js", () => ({ gqlSafe: vi.fn() }));
vi.mock("../rpc/lava.js", () => ({
  fetchAllProviders: vi.fn(),
  fetchProvidersForSpec: vi.fn(),
  fetchAllSpecs: vi.fn(),
  fetchProviderAvatar: vi.fn(),
  fetchDelegatorRewards: vi.fn(),
}));
vi.mock("../services/health-store.js", () => ({
  readHealthForProvider: vi.fn(),
  readHealthMapForProvider: vi.fn(),
}));

const { gqlSafe } = await import("../graphql/client.js");
const { fetchAllProviders, fetchAllSpecs, fetchProvidersForSpec } = await import("../rpc/lava.js");
const { providerRoutes } = await import("../routes/providers.js");

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(paginationPlugin);
  await app.register(providerRoutes, { prefix: "/providers" });
  return app;
}

beforeEach(() => vi.resetAllMocks());

const MOCK_ALL_PROVIDERS = [
  {
    address: "lava@alpha", moniker: "AlphaProvider", identity: "",
    totalStake: "2000", totalDelegation: "100", commission: "5",
    specs: ["ETH1", "LAVA"],
  },
  {
    address: "lava@beta", moniker: "BetaProvider", identity: "",
    totalStake: "1000", totalDelegation: "50", commission: "10",
    specs: ["ETH1"],
  },
];

describe("GET /providers", () => {
  it("paginates and sorts providers by totalStake desc", async () => {
    (fetchAllProviders as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_ALL_PROVIDERS);
    (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue({
      mvRelayDailies: { groupedAggregates: [{ keys: ["lava@alpha"], sum: { cu: "500", relays: "100" } }] },
    });

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/providers?page=1&limit=10" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].provider).toBe("lava@alpha"); // bigger stake first
    expect(body.data[0].cuSum30d).toBe("500");
    expect(body.data[1].cuSum30d).toBeNull();
    expect(body.pagination).toEqual({ total: 2, page: 1, limit: 10, pages: 1 });
  });
});

describe("GET /providers/:addr — schema validation", () => {
  it("rejects an invalid address pattern with 400", async () => {
    (fetchAllSpecs as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/providers/notlava" });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /providers/:addr/stakes", () => {
  it("returns stakes filtered to the requested provider", async () => {
    (fetchAllSpecs as ReturnType<typeof vi.fn>).mockResolvedValue([
      { index: "ETH1", name: "Ethereum" },
    ]);
    (fetchProvidersForSpec as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        address: "lava@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        moniker: "Alpha", identity: "",
        stake: { amount: "1000" },
        delegate_total: { amount: "0" },
        delegate_commission: "5",
        geolocation: 1,
        addons: "", extensions: "",
        apiInterfaces: "",
        endpoints: [],
      },
      {
        address: "lava@bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        moniker: "Beta", identity: "",
        stake: { amount: "500" },
        delegate_total: { amount: "0" },
        delegate_commission: "10",
        geolocation: 1,
        addons: "", extensions: "",
        apiInterfaces: "",
        endpoints: [],
      },
    ]);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/providers/lava@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/stakes" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].stake).toBe("1000");
  });
});
