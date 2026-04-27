import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { errorHandlerPlugin } from "../plugins/error-handler.js";

vi.mock("../rpc/lava.js", () => ({
  computeTVL: vi.fn(),
}));

const { computeTVL } = await import("../rpc/lava.js");
const { tvlRoutes } = await import("../routes/tvl.js");

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(tvlRoutes);
  return app;
}

describe("GET /tvl", () => {
  it("returns TVL in USD computed from multiple sources", async () => {
    (computeTVL as ReturnType<typeof vi.fn>).mockResolvedValue({
      tvl: "13521853.7995",
    });

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/tvl" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.tvl).toBe("13521853.7995");
    expect(body).toEqual({ tvl: expect.any(String) });
  });

  it("handles RPC error gracefully", async () => {
    (computeTVL as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("RPC down"));
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/tvl" });
    expect(res.statusCode).toBe(500);
  });
});

describe("TVL alias paths (jsinfo backwards compatibility)", () => {
  it.each(["/total_value_locked", "/total_locked_value", "/tlv"])(
    "%s returns the same payload as /tvl",
    async (path) => {
      (computeTVL as ReturnType<typeof vi.fn>).mockResolvedValue({ tvl: "42.0000" });
      const app = await buildApp();
      const res = await app.inject({ method: "GET", url: path });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ tvl: "42.0000" });
    },
  );
});
