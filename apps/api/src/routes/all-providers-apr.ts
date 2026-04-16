import type { FastifyInstance } from "fastify";
import { computeAllProvidersApr, type AllProviderAprEntry } from "../rpc/lava.js";
import { gqlSafe } from "../graphql/client.js";
import { readPrecomputed } from "../services/precompute-store.js";

export async function allProvidersAprRoutes(app: FastifyInstance) {
  // GET /all_providers_apr — per-provider APR, commission, 30d relays, reward breakdown.
  // Prefers the precomputed value from bin/precompute.ts; falls back to live
  // compute when the precompute worker hasn't populated the key yet.
  app.get("/", {
    schema: { tags: ["APR"], summary: "Per-provider APR with commission, 30d relays, and reward breakdown" },
    config: { cacheTTL: 1800 },
  }, async (request) => {
    const cached = await readPrecomputed<AllProviderAprEntry[]>(request.server.redis, "all_providers_apr");
    if (cached) return cached.value;

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
        const provider = agg.keys[0];
        if (provider) relay30d.set(provider, { cu: agg.sum.cu, relays: agg.sum.relays });
      }
    }

    return await computeAllProvidersApr(relay30d, request.server.redis);
  });
}
