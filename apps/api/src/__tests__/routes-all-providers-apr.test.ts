import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { paginationPlugin } from "../plugins/pagination.js";
import { errorHandlerPlugin } from "../plugins/error-handler.js";

vi.mock("../rpc/lava.js", () => ({
  computeAllProvidersApr: vi.fn(),
}));

vi.mock("../graphql/client.js", () => ({
  gqlSafe: vi.fn().mockResolvedValue(null),
}));

const { computeAllProvidersApr } = await import("../rpc/lava.js");
const { allProvidersAprRoutes } = await import("../routes/all-providers-apr.js");

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(paginationPlugin);
  await app.register(allProvidersAprRoutes, { prefix: "/all_providers_apr" });
  return app;
}

const MOCK_PROVIDER = {
  address: "lava@1provider",
  moniker: "TestProvider",
  apr: "12.5000%",
  commission: "50.0%",
  "30_days_cu_served": "1000000",
  "30_days_relays_served": "500000",
  rewards_10k_lava_delegation: [
    {
      source_denom: "ulava",
      resolved_amount: "100000000",
      resolved_denom: "ulava",
      display_denom: "lava",
      display_amount: "100",
      value_usd: "$3.35",
    },
  ],
  rewards_last_month: [
    {
      chain: "Ethereum Mainnet",
      spec: "ETH1",
      tokens: [
        {
          source_denom: "ulava",
          resolved_amount: "50000000",
          resolved_denom: "ulava",
          display_denom: "lava",
          display_amount: "50",
          value_usd: "$1.67",
        },
      ],
      total_usd: 1.67,
    },
  ],
  specs: [
    {
      chain: "Ethereum Mainnet",
      spec: "ETH1",
      stakestatus: "Active",
      stake: "5000000000",
      addons: "trace",
      extensions: "archive",
      delegateCommission: "50",
      delegateTotal: "100000000000",
      moniker: "TestProvider",
    },
  ],
  stake: "5000000000",
  stakestatus: "Active",
  addons: "trace",
  extensions: "archive",
  delegateTotal: "100000000000",
  avatar: "https://example.com/avatar.jpg",
};

describe("GET /all_providers_apr", () => {
  it("returns per-provider APR data with full jsinfo shape", async () => {
    (computeAllProvidersApr as ReturnType<typeof vi.fn>).mockResolvedValue([MOCK_PROVIDER]);

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/all_providers_apr" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveLength(1);

    const p = body[0];
    expect(p.address).toBe("lava@1provider");
    expect(p.apr).toBe("12.5000%");
    expect(p.commission).toBe("50.0%");
    expect(p.rewards_10k_lava_delegation).toHaveLength(1);
    expect(p.rewards_10k_lava_delegation[0].display_denom).toBe("lava");
    expect(p.rewards_last_month).toHaveLength(1);
    expect(p.rewards_last_month[0].spec).toBe("ETH1");
    expect(p.rewards_last_month[0].total_usd).toBeCloseTo(1.67);
    expect(p.specs).toHaveLength(1);
    expect(p.specs[0].spec).toBe("ETH1");
    expect(p.stake).toBe("5000000000");
    expect(p.avatar).toBe("https://example.com/avatar.jpg");
  });

  it("handles RPC error gracefully", async () => {
    (computeAllProvidersApr as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("RPC down"),
    );
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/all_providers_apr" });
    expect(res.statusCode).toBe(500);
  });
});
