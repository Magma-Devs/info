import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { errorHandlerPlugin } from "../plugins/error-handler.js";

vi.mock("../graphql/client.js", () => ({ gqlSafe: vi.fn() }));
vi.mock("../rpc/lava.js", () => ({
  fetchLatestBlockHeight: vi.fn(),
  fetchAllProviders: vi.fn(),
}));

const { gqlSafe } = await import("../graphql/client.js");
const { fetchLatestBlockHeight, fetchAllProviders } = await import("../rpc/lava.js");
const { indexRoutes } = await import("../routes/index.js");

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(indexRoutes, { prefix: "/index" });
  return app;
}

beforeEach(() => vi.resetAllMocks());

describe("GET /index/stats", () => {
  it("returns aggregate stats enriched with latest block height", async () => {
    (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue({
      mvRelayDailies: { aggregates: { sum: { cu: "1000", relays: "50" } } },
    });
    (fetchLatestBlockHeight as ReturnType<typeof vi.fn>).mockResolvedValue({
      height: 12345,
      time: "2025-01-01T00:00:00Z",
    });
    (fetchAllProviders as ReturnType<typeof vi.fn>).mockResolvedValue([
      { address: "lava@a", totalStake: "1000", totalDelegation: "500" },
    ]);

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/index/stats" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.latestBlock).toBe(12345);
    expect(body.activeProviderCount).toBe(1);
    expect(body.totalStake).toBe("1500");
  });
});

describe("GET /index/charts", () => {
  it("returns empty data when indexer is down", async () => {
    (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/index/charts" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ data: [] });
  });

  it("groups daily MV rows by (date, chainId) and computes weighted QoS", async () => {
    (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue({
      mvRelayDailies: {
        nodes: [
          {
            date: "2025-01-01", chainId: "ETH1", cu: "100", relays: "10",
            qosSyncW: 8, qosAvailW: 9, qosLatencyW: 10, qosWeight: "10",
          },
          {
            date: "2025-01-01", chainId: "ETH1", cu: "50", relays: "5",
            qosSyncW: 4, qosAvailW: 5, qosLatencyW: 5, qosWeight: "5",
          },
        ],
      },
    });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/index/charts?from=2025-01-01&to=2025-01-31" });
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(1);
    const row = body.data[0];
    expect(row.cu).toBe("150");
    expect(row.relays).toBe("15");
    expect(row.qosSync).toBeCloseTo(12 / 15);
  });
});
