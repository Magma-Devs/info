import type { FastifyInstance } from "fastify";
import { CACHE_TTL } from "../config.js";
import { gqlSafe } from "../graphql/client.js";
import { fetchAllSpecs, fetchProvidersForSpec } from "../rpc/lava.js";
import { readHealthSummaryForSpec, readHealthByProviderForSpec } from "../services/health-store.js";

const specIdSchema = {
  params: {
    type: "object" as const,
    properties: { specId: { type: "string" as const, pattern: "^[A-Za-z0-9_-]{1,30}$" } },
    required: ["specId"] as const,
  },
};

export async function specRoutes(app: FastifyInstance) {
  // GET /specs — chain RPC + indexer relay data
  app.get("/", {
    schema: { tags: ["Specs"], summary: "All specs with provider counts and 30d relay data" },
    config: { cacheTTL: CACHE_TTL.LIST },
  }, async () => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [specs, relayData] = await Promise.all([
      fetchAllSpecs(),
      gqlSafe<{
        allMvRelayDailies: {
          groupedAggregates: Array<{ keys: string[]; sum: { cu: string; relays: string } }>;
        };
      } | null>(`query($since: Date!) {
        allMvRelayDailies(filter: { date: { greaterThanOrEqualTo: $since } }) {
          groupedAggregates(groupBy: CHAIN_ID) {
            keys
            sum { cu relays }
          }
        }
      }`, { since }, null),
    ]);

    const relayMap = new Map<string, { cu: string; relays: string }>();
    if (relayData) {
      for (const agg of relayData.allMvRelayDailies.groupedAggregates) {
        const key = agg.keys[0];
        if (key) relayMap.set(key, { cu: agg.sum.cu, relays: agg.sum.relays });
      }
    }

    const specProviders = await Promise.all(
      specs.map((s) =>
        fetchProvidersForSpec(s.index)
          .then((ps) => {
            const relay = relayMap.get(s.index);
            return {
              specId: s.index,
              name: s.name,
              providerCount: ps.length,
              relays30d: relay?.relays ?? null,
              cu30d: relay?.cu ?? null,
            };
          })
          .catch(() => ({ specId: s.index, name: s.name, providerCount: 0, relays30d: null as string | null, cu30d: null as string | null })),
      ),
    );

    return { data: specProviders.sort((a, b) => b.providerCount - a.providerCount) };
  });

  // GET /specs/:specId/stakes — chain RPC + health from Redis + 30d relays from indexer
  app.get<{ Params: { specId: string } }>("/:specId/stakes", {
    schema: { ...specIdSchema, tags: ["Specs"], summary: "Providers staked on this spec with health and 30d relay totals" },
    config: { cacheTTL: CACHE_TTL.LIST },
  }, async (request) => {
    const { specId } = request.params;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [providers, relayData] = await Promise.all([
      fetchProvidersForSpec(specId),
      gqlSafe<{
        allMvRelayDailies: {
          groupedAggregates: Array<{ keys: string[]; sum: { cu: string; relays: string } }>;
        };
      } | null>(`query($chainId: String!, $since: Date!) {
        allMvRelayDailies(filter: { chainId: { equalTo: $chainId }, date: { greaterThanOrEqualTo: $since } }) {
          groupedAggregates(groupBy: PROVIDER) {
            keys
            sum { cu relays }
          }
        }
      }`, { chainId: specId, since }, null),
    ]);

    const relayMap = new Map<string, { cu: string; relays: string }>();
    if (relayData) {
      for (const agg of relayData.allMvRelayDailies.groupedAggregates) {
        const provider = agg.keys[0];
        if (provider) relayMap.set(provider, { cu: agg.sum.cu, relays: agg.sum.relays });
      }
    }

    let healthMap = new Map<string, unknown>();
    if (app.redis) {
      try {
        healthMap = await readHealthByProviderForSpec(app.redis, specId);
      } catch {
        // Redis transient error — serve without health data
      }
    }

    return {
      data: providers.map((p) => {
        const relay = relayMap.get(p.address);
        return {
          provider: p.address,
          moniker: p.moniker,
          identity: p.identity,
          stake: p.stake?.amount ?? "0",
          delegation: p.delegate_total?.amount ?? "0",
          delegateCommission: p.delegate_commission,
          geolocation: p.geolocation,
          cuSum30d: relay?.cu ?? null,
          relaySum30d: relay?.relays ?? null,
          health: healthMap.get(p.address) ?? null,
        };
      }),
    };
  });

  // GET /specs/:specId/health — from Redis
  app.get<{ Params: { specId: string } }>("/:specId/health", {
    schema: { ...specIdSchema, tags: ["Specs"], summary: "Health status distribution for a spec" },
    config: { cacheTTL: CACHE_TTL.HEALTH_PROBE },
  }, async (request) => {
    const { specId } = request.params;

    if (!app.redis) {
      return { data: [] };
    }

    try {
      const summary = await readHealthSummaryForSpec(app.redis, specId);
      return { data: summary };
    } catch {
      return { data: [] };
    }
  });

  // GET /specs/:specId/charts — indexer GraphQL (materialized view)
  app.get<{ Params: { specId: string } }>("/:specId/charts", {
    schema: { ...specIdSchema, tags: ["Specs"], summary: "Alltime CU/relays for a chain" },
    config: { cacheTTL: CACHE_TTL.LIST },
  }, async (request) => {
    const { specId } = request.params;

    const data = await gqlSafe<{
      allMvRelayDailies: {
        groupedAggregates: Array<{ keys: string[]; sum: { cu: string; relays: string } }>;
      };
    } | null>(`query($chainId: String!) {
      allMvRelayDailies(filter: { chainId: { equalTo: $chainId } }) {
        groupedAggregates(groupBy: CHAIN_ID) {
          keys
          sum { cu relays }
        }
      }
    }`, { chainId: specId }, null);

    if (!data) return { data: [] };

    return {
      data: data.allMvRelayDailies.groupedAggregates.map((g) => ({
        chainId: g.keys[0],
        cu: g.sum.cu,
        relays: g.sum.relays,
      })),
    };
  });

}
