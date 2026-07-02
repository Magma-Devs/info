import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
afterEach(() => vi.useRealTimers());

describe("GET /index/stats", () => {
  it("returns aggregate stats enriched with latest block height", async () => {
    (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue({
      allMvRelayDailies: { aggregates: { sum: { cu: "1000", relays: "50" } } },
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

describe("GET /index/top-chains", () => {
  it("returns top chains using 30-day relay data sorted by CU", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-02-15T12:00:00Z"));
    (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue({
      allMvRelayDailies: {
        groupedAggregates: [
          { keys: ["LOWCU"], sum: { cu: "100", relays: "10000" } },
          { keys: ["HIGHCU"], sum: { cu: "500", relays: "1" } },
          { keys: ["MIDCU"], sum: { cu: "300", relays: "500" } },
        ],
      },
    });

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/index/top-chains" });

    expect(res.statusCode).toBe(200);
    expect(gqlSafe).toHaveBeenCalledWith(
      expect.stringContaining("query($since: Date!)"),
      { since: "2025-01-16" },
      null,
    );
    expect(JSON.parse(res.body)).toEqual({
      data: [
        { specId: "HIGHCU", totalCu: "500", totalRelays: "1" },
        { specId: "MIDCU", totalCu: "300", totalRelays: "500" },
        { specId: "LOWCU", totalCu: "100", totalRelays: "10000" },
      ],
    });
  });

  it("returns only the top 20 chains", async () => {
    (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue({
      allMvRelayDailies: {
        groupedAggregates: Array.from({ length: 25 }, (_, i) => ({
          keys: [`CHAIN${i}`],
          sum: { cu: String(25 - i), relays: String(i) },
        })),
      },
    });

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/index/top-chains" });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toHaveLength(20);
  });

  it("returns empty data when indexer is down", async () => {
    (gqlSafe as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/index/top-chains" });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ data: [] });
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
      allMvRelayDailies: {
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
