import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { paginationPlugin } from "../plugins/pagination.js";
import { errorHandlerPlugin } from "../plugins/error-handler.js";

vi.mock("../rpc/lava.js", () => ({
  computeAPR: vi.fn(),
}));

const { computeAPR } = await import("../rpc/lava.js");
const { aprRoutes } = await import("../routes/apr.js");

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(paginationPlugin);
  await app.register(aprRoutes);
  return app;
}

describe("GET /apr", () => {
  it("returns APR computed from RPC", async () => {
    (computeAPR as ReturnType<typeof vi.fn>).mockResolvedValue({
      apr: 0.1234,
      annualProvisions: "100000000000",
      communityTax: 0.02,
      bondedTokens: "500000000000",
    });

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/apr" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.apr).toBeCloseTo(0.1234);
    expect(body.annualProvisions).toBe("100000000000");
    expect(body.communityTax).toBe(0.02);
    expect(body.bondedTokens).toBe("500000000000");
  });

  it("handles RPC error gracefully", async () => {
    (computeAPR as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("RPC down"));
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/apr" });
    expect(res.statusCode).toBe(500);
  });
});
