import type { FastifyInstance } from "fastify";
import { CACHE_TTL } from "../config.js";
import { computeTVL } from "../rpc/lava.js";

// Aliases preserved from jsinfo for backwards compatibility with existing
// consumers. All four paths return the same USD-denominated TVL payload.
const TVL_PATHS = ["/tvl", "/total_value_locked", "/total_locked_value", "/tlv"] as const;

export async function tvlRoutes(app: FastifyInstance) {
  for (const path of TVL_PATHS) {
    app.get(path, {
      schema: { tags: ["TVL"], summary: "Total Value Locked in USD" },
      config: { cacheTTL: CACHE_TTL.LIST },
    }, async () => await computeTVL());
  }
}
