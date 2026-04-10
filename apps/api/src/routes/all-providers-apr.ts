import type { FastifyInstance } from "fastify";
import { computeAllProvidersApr } from "../rpc/lava.js";
import { gqlSafe } from "../graphql/client.js";

export async function allProvidersAprRoutes(app: FastifyInstance) {
  // GET /all_providers_apr — per-provider APR, commission, 30d relays, reward breakdown
  // Matches jsinfo /all_providers_apr response format. Cached 30 min (expensive).
  app.get("/", { config: { cacheTTL: 1800 } }, async (request) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    // Fetch 30d relay data from indexer MV
    const relayData = await gqlSafe<{
      mvRelayDailies: {
        groupedAggregates: Array<{
          keys: string[];
          sum: { cu: string; relays: string };
        }>;
      };
    } | null>(`query($since: Date!) {
      mvRelayDailies(filter: { date: { greaterThanOrEqualTo: $since } }) {
        groupedAggregates(groupBy: PROVIDER) {
          keys
          sum { cu relays }
        }
      }
    }`, { since }, null);

    const relay30d = new Map<string, { cu: string; relays: string }>();
    if (relayData) {
      for (const agg of relayData.mvRelayDailies.groupedAggregates) {
        relay30d.set(agg.keys[0], { cu: agg.sum.cu, relays: agg.sum.relays });
      }
    }

    return await computeAllProvidersApr(relay30d, request.server.redis);
  });
}
