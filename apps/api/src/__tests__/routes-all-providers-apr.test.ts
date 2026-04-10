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

describe("GET /all_providers_apr", () => {
  it("returns per-provider APR data", async () => {
    (computeAllProvidersApr as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        address: "lava@provider1",
        moniker: "Provider One",
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
            value_usd: "$50",
          },
        ],
      },
    ]);

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/all_providers_apr" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveLength(1);
    expect(body[0].address).toBe("lava@provider1");
    expect(body[0].apr).toBe("12.5000%");
    expect(body[0].commission).toBe("50.0%");
    expect(body[0].rewards_10k_lava_delegation).toHaveLength(1);
    expect(body[0].rewards_10k_lava_delegation[0].display_denom).toBe("lava");
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
