import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { errorHandlerPlugin } from "../plugins/error-handler.js";

vi.mock("../rpc/lava.js", () => ({
  fetchAllProviders: vi.fn(),
  fetchAllSpecs: vi.fn(),
}));

const { fetchAllProviders, fetchAllSpecs } = await import("../rpc/lava.js");
const { searchRoutes } = await import("../routes/search.js");

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(searchRoutes);
  return app;
}

const MOCK_PROVIDERS = [
  { address: "lava@abc", moniker: "AlphaProvider", identity: "", totalStake: "1000", totalDelegation: "0", commission: "5", specs: ["ETH1"] },
  { address: "lava@xyz", moniker: "BetaProvider", identity: "", totalStake: "500", totalDelegation: "0", commission: "10", specs: ["LAVA"] },
];
const MOCK_SPECS = [
  { index: "ETH1", name: "Ethereum Mainnet" },
  { index: "LAVA", name: "Lava Mainnet" },
];

describe("GET /search", () => {
  it("returns combined provider+spec results matching case-insensitive query", async () => {
    (fetchAllProviders as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_PROVIDERS);
    (fetchAllSpecs as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SPECS);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/search?q=alpha" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.some((r: { moniker: string }) => r.moniker === "AlphaProvider")).toBe(true);
    expect(body.data.some((r: { moniker: string }) => r.moniker === "BetaProvider")).toBe(false);
  });

  it("matches on spec name", async () => {
    (fetchAllProviders as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_PROVIDERS);
    (fetchAllSpecs as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SPECS);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/search?q=ethereum" });
    const body = JSON.parse(res.body);
    expect(body.data.some((r: { type: string; name: string }) => r.type === "spec" && r.name === "ETH1")).toBe(true);
  });

  it("returns everything when no query", async () => {
    (fetchAllProviders as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_PROVIDERS);
    (fetchAllSpecs as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SPECS);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/search" });
    const body = JSON.parse(res.body);
    expect(body.data.length).toBe(MOCK_PROVIDERS.length + MOCK_SPECS.length);
  });
});
