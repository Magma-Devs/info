import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { errorHandlerPlugin } from "../plugins/error-handler.js";

vi.mock("../rpc/lava.js", () => ({
  fetchAllSpecs: vi.fn(),
}));

const { fetchAllSpecs } = await import("../rpc/lava.js");
const { lavaRoutes } = await import("../routes/lava.js");

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(lavaRoutes, { prefix: "/lava" });
  return app;
}

describe("GET /lava/specs", () => {
  it("returns all chain specs with index, name, and absolute icon URL", async () => {
    (fetchAllSpecs as ReturnType<typeof vi.fn>).mockResolvedValue([
      { index: "ETH1", name: "Ethereum Mainnet" },
      { index: "LAVA", name: "Lava Mainnet" },
    ]);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/lava/specs" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toEqual({
      index: "ETH1",
      name: "Ethereum Mainnet",
      icon: expect.stringMatching(/^https?:\/\/[^/]+\/chains\/ethereum\.svg$/),
    });
    expect(body.data[1]).toEqual({
      index: "LAVA",
      name: "Lava Mainnet",
      icon: expect.stringMatching(/^https?:\/\/[^/]+\/chains\/lava\.svg$/),
    });
  });

  it("returns empty data if rpc returns nothing", async () => {
    (fetchAllSpecs as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/lava/specs" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toEqual([]);
  });
});
