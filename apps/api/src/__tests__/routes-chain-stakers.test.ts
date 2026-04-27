import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { errorHandlerPlugin } from "../plugins/error-handler.js";

vi.mock("../rpc/providers.js", async () => {
  const actual = await vi.importActual<typeof import("../rpc/providers.js")>("../rpc/providers.js");
  return {
    ...actual,
    fetchAllProviders: vi.fn(),
    fetchProviderDelegations: vi.fn(),
  };
});

const { fetchAllProviders, fetchProviderDelegations } = await import("../rpc/providers.js");
const { chainStakersRoutes } = await import("../routes/chain-stakers.js");

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(chainStakersRoutes);
  return app;
}

const NOW = 1_700_000_000;
const FRESH = (NOW - 60).toString(); // within last 30d
const OLD = (NOW - 60 * 24 * 60 * 60).toString(); // 60d ago

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW * 1000));

  (fetchAllProviders as ReturnType<typeof vi.fn>).mockResolvedValue([
    { address: "lava@p1", moniker: "P1", identity: "", totalStake: "0", totalDelegation: "0", commission: "0", specs: [] },
    { address: "lava@p2", moniker: "P2", identity: "", totalStake: "0", totalDelegation: "0", commission: "0", specs: [] },
  ]);
});

function delegationsBy(addr: string) {
  // Same delegator across providers should dedupe; old timestamps drop from monthly.
  const map: Record<string, Array<{ delegator: string; timestamp: string; provider: string; chainID: string; amount: { denom: string; amount: string } }>> = {
    "lava@p1": [
      { delegator: "lava@alice", timestamp: FRESH, provider: "lava@p1", chainID: "*", amount: { denom: "ulava", amount: "1" } },
      { delegator: "lava@bob",   timestamp: OLD,   provider: "lava@p1", chainID: "*", amount: { denom: "ulava", amount: "1" } },
      { delegator: "  ",         timestamp: FRESH, provider: "lava@p1", chainID: "*", amount: { denom: "ulava", amount: "0" } },
    ],
    "lava@p2": [
      { delegator: "lava@alice", timestamp: FRESH, provider: "lava@p2", chainID: "*", amount: { denom: "ulava", amount: "1" } },
      { delegator: "lava@carol", timestamp: FRESH, provider: "lava@p2", chainID: "*", amount: { denom: "ulava", amount: "1" } },
    ],
    "empty_provider": [
      { delegator: "lava@dave",  timestamp: FRESH, provider: "empty_provider", chainID: "*", amount: { denom: "ulava", amount: "1" } },
      { delegator: "lava@bob",   timestamp: FRESH, provider: "empty_provider", chainID: "*", amount: { denom: "ulava", amount: "1" } },
    ],
  };
  return map[addr] ?? [];
}

describe("GET /lava_chain_stakers", () => {
  it("counts unique delegators across providers + empty_provider, dedupes, and applies monthly window", async () => {
    (fetchProviderDelegations as ReturnType<typeof vi.fn>).mockImplementation((addr: string) =>
      Promise.resolve(delegationsBy(addr)),
    );

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/lava_chain_stakers" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    // total: alice, bob, carol, dave = 4 (whitespace delegator skipped)
    // monthly: alice (fresh on p1/p2), carol (fresh on p2), dave + bob (fresh on empty_provider)
    expect(body).toEqual({ total: "4", monthly: "4" });
    expect(fetchProviderDelegations).toHaveBeenCalledWith("empty_provider");
  });
});

describe("GET /lava_chain_restakers", () => {
  it("excludes empty_provider — bob stays out of monthly because his only fresh delegation is on empty_provider", async () => {
    (fetchProviderDelegations as ReturnType<typeof vi.fn>).mockImplementation((addr: string) =>
      Promise.resolve(delegationsBy(addr)),
    );

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/lava_chain_restakers" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    // total: alice, bob, carol = 3 (no dave; bob counted via OLD on p1)
    // monthly: alice, carol = 2 (bob's only fresh delegation was on empty_provider, excluded)
    expect(body).toEqual({ total: "3", monthly: "2" });
    expect(fetchProviderDelegations).not.toHaveBeenCalledWith("empty_provider");
  });

  it("returns zeros when no providers are returned", async () => {
    (fetchAllProviders as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    (fetchProviderDelegations as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/lava_chain_restakers" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ total: "0", monthly: "0" });
    expect(fetchProviderDelegations).not.toHaveBeenCalled();
  });
});
