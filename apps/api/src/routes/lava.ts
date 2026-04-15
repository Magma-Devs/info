import type { FastifyInstance } from "fastify";
import { fetchAllSpecs, fetchLavaUsdPriceAt } from "../rpc/lava.js";

export async function lavaRoutes(app: FastifyInstance) {
  // GET /lava/specs — all chain specs (consumed by frontend useChainNames hook)
  app.get("/specs", {
    schema: { tags: ["Lava"], summary: "All chain specs (raw, for frontend chain name lookup)" },
    config: { cacheTTL: 300 },
  }, async () => {
    const specs = await fetchAllSpecs();
    return { data: specs };
  });

  // GET /lava/price — LAVA USD price, current or at a specific date
  // ?date=2025-04-17 or ?date=1713369600 (unix seconds)
  app.get<{ Querystring: { date?: string } }>("/price", {
    schema: {
      tags: ["Lava"],
      summary: "LAVA USD price (current or historical)",
      querystring: {
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD or unix seconds. Omit for current price." },
        },
      },
    },
    config: { cacheTTL: 300, rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const { date: raw } = request.query;

    if (!raw) {
      const res = await fetch(
        `${process.env.COINGECKO_API_URL ?? "https://api.coingecko.com/api/v3"}/simple/price?ids=lava-network&vs_currencies=usd`,
      );
      if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
      const data = (await res.json()) as { "lava-network"?: { usd?: number } };
      return { price: data["lava-network"]?.usd ?? null, date: null };
    }

    // Parse as unix seconds or YYYY-MM-DD
    let d: Date;
    const asNum = Number(raw);
    if (!Number.isNaN(asNum) && asNum > 1_000_000_000 && asNum < 1e13) {
      d = new Date(asNum * 1000);
    } else {
      const ms = Date.parse(raw);
      if (Number.isNaN(ms)) {
        reply.status(400);
        return { error: "Invalid date. Use YYYY-MM-DD or unix seconds." };
      }
      d = new Date(ms);
    }

    if (d > new Date()) {
      reply.status(400);
      return { error: "Date cannot be in the future." };
    }

    const price = await fetchLavaUsdPriceAt(d);
    return {
      price,
      date: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
    };
  });
}
