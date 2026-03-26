import { describe, it, expect, vi } from "vitest";
import Fastify from "fastify";
import { paginationPlugin } from "../plugins/pagination.js";
import { csvPlugin } from "../plugins/csv.js";
import { errorHandlerPlugin } from "../plugins/error-handler.js";

vi.mock("../rpc/lava.js", () => ({
  fetchSupplyFromChain: vi.fn(),
}));

const { fetchSupplyFromChain } = await import("../rpc/lava.js");
const { supplyRoutes } = await import("../routes/supply.js");

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(paginationPlugin);
  await app.register(csvPlugin);
  await app.register(supplyRoutes, { prefix: "/supply" });
  return app;
}

describe("GET /supply/total", () => {
  it("returns total supply from chain RPC", async () => {
    (fetchSupplyFromChain as ReturnType<typeof vi.fn>).mockResolvedValue({ total: "1000000000", denom: "ulava" });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/supply/total" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("1000000000");
  });

  it("returns 0 when chain returns no lava", async () => {
    (fetchSupplyFromChain as ReturnType<typeof vi.fn>).mockResolvedValue({ total: "0", denom: "ulava" });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/supply/total" });
    expect(res.body).toBe("0");
  });
});

describe("GET /supply/circulating", () => {
  it("returns circulating supply", async () => {
    (fetchSupplyFromChain as ReturnType<typeof vi.fn>).mockResolvedValue({ total: "500000000", denom: "ulava" });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/supply/circulating" });
    expect(res.body).toBe("500000000");
  });
});
