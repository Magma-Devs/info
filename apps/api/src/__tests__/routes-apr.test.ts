import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { errorHandlerPlugin } from "../plugins/error-handler.js";

vi.mock("../rpc/lava.js", () => ({
  computeAPR: vi.fn(),
}));

const { computeAPR } = await import("../rpc/lava.js");
const { aprRoutes } = await import("../routes/apr.js");

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(aprRoutes);
  return app;
}

describe("GET /apr", () => {
  it("returns restaking and staking APR percentiles", async () => {
    (computeAPR as ReturnType<typeof vi.fn>).mockResolvedValue({
      restaking_apr_percentile: 0.0842,
      staking_apr_percentile: 0.1523,
    });

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/apr" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.restaking_apr_percentile).toBeCloseTo(0.0842);
    expect(body.staking_apr_percentile).toBeCloseTo(0.1523);
  });

  it("handles RPC error gracefully", async () => {
    (computeAPR as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("RPC down"));
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/apr" });
    expect(res.statusCode).toBe(500);
  });
});
