import type { FastifyInstance } from "fastify";
import { fetchTotalSupply, fetchCirculatingSupply, fetchBlockAtTimestamp } from "../rpc/lava.js";

const ULAVA_TO_LAVA = 1_000_000n;

function parseTimestamp(raw: string): number | null {
  const asNum = Number(raw);
  if (!Number.isNaN(asNum) && asNum > 1_000_000_000 && asNum < 1e13) {
    return asNum;
  }
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}

export async function supplyRoutes(app: FastifyInstance) {
  // GET /supply/total — total token supply in lava, cached 5 min
  // Optional ?timestamp= for historical supply (unix seconds or ISO-8601 datetime)
  app.get<{ Querystring: { timestamp?: string } }>("/total", {
    schema: {
      tags: ["Supply"],
      summary: "Total LAVA supply (plain text)",
      querystring: {
        type: "object",
        properties: {
          timestamp: { type: "string", description: "Unix seconds or ISO-8601 datetime for historical lookup" },
        },
      },
    },
    config: { cacheTTL: 300, rateLimit: { max: 20, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    let blockHeight: number | undefined;

    if (request.query.timestamp) {
      const unix = parseTimestamp(request.query.timestamp);
      if (unix === null) {
        reply.status(400);
        return "Invalid timestamp. Use unix seconds (e.g. 1713369600) or ISO-8601 (e.g. 2025-04-17T15:00:00Z).";
      }
      blockHeight = await fetchBlockAtTimestamp(unix);
    }

    const total = await fetchTotalSupply(blockHeight);
    reply.header("Content-Type", "text/plain");
    return (total / ULAVA_TO_LAVA).toString();
  });

  // GET /supply/circulating — total - locked vesting - reward pools, in lava
  app.get("/circulating", {
    schema: { tags: ["Supply"], summary: "Circulating LAVA supply (plain text)" },
    config: { cacheTTL: 300, rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (_request, reply) => {
    const circulating = await fetchCirculatingSupply();
    reply.header("Content-Type", "text/plain");
    return (circulating / ULAVA_TO_LAVA).toString();
  });
}
