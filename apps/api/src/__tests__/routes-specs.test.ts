import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { errorHandlerPlugin } from "../plugins/error-handler.js";

vi.mock("../graphql/client.js", () => ({
  gqlSafe: vi.fn(),
}));

vi.mock("../rpc/lava.js", () => ({
  fetchAllSpecs: vi.fn(),
  fetchProvidersForSpec: vi.fn(),
}));

vi.mock("../services/health-store.js", () => ({
  readHealthSummaryForSpec: vi.fn(),
  readHealthByProviderForSpec: vi.fn(),
}));

const { gqlSafe } = await import("../graphql/client.js");
const { fetchAllSpecs, fetchProvidersForSpec } = await import("../rpc/lava.js");
const { readHealthSummaryForSpec } = await import("../services/health-store.js");
const { specRoutes } = await import("../routes/specs.js");

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(specRoutes, { prefix: "/specs" });
  return app;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /specs", () => {
  it("returns specs sorted by provider count desc, enriched with 30d relay data", async () => {
    (fetchAllSpecs as ReturnType<typeof vi.fn>).mockResolvedValue([
      { index: "ETH1", name: "Ethereum Mainnet" },
      { index: "LAVA", name: "Lava Mainnet" },
    ]);
    (fetchProvidersForSpec as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([{}, {}, {}]) // ETH1 has 3
      .mockResolvedValueOnce([{}]);        // LAVA has 1
    (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue({
      mvRelayDailies: {
        groupedAggregates: [
          { keys: ["ETH1"], sum: { cu: "500", relays: "100" } },
        ],
      },
    });

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/specs" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data[0].specId).toBe("ETH1"); // more providers first
    expect(body.data[0].providerCount).toBe(3);
    expect(body.data[0].relays30d).toBe("100");
    expect(body.data[1].relays30d).toBeNull();
  });

  it("gracefully returns empty list when indexer is down", async () => {
    (fetchAllSpecs as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/specs" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toEqual([]);
  });
});

describe("GET /specs/:specId/health", () => {
  it("rejects invalid specId via schema validation", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/specs/$$$bad/health" });
    expect(res.statusCode).toBe(400);
  });

  it("returns empty data gracefully when Redis isn't decorated", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/specs/ETH1/health" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ data: [] });
  });
});
