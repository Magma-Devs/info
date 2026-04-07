import type { FastifyInstance } from "fastify";
import { gqlSafe } from "../graphql/client.js";
import { fetchAllSpecs, fetchProvidersForSpec, fetchIprpcSpecRewards } from "../rpc/lava.js";
import { readHealthSummaryForSpec } from "../services/health-store.js";

export async function specRoutes(app: FastifyInstance) {
  // GET /specs — chain RPC + indexer relay data
  app.get("/", { config: { cacheTTL: 300 } }, async () => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [specs, relayData] = await Promise.all([
      fetchAllSpecs(),
      gqlSafe<{
        mvRelayDailies: {
          groupedAggregates: Array<{ keys: string[]; sum: { cu: string; relays: string } }>;
        };
      } | null>(`query($since: Date!) {
        mvRelayDailies(filter: { date: { greaterThanOrEqualTo: $since } }) {
          groupedAggregates(groupBy: CHAIN_ID) {
            keys
            sum { cu relays }
          }
        }
      }`, { since }, null),
    ]);

    const relayMap = new Map<string, { cu: string; relays: string }>();
    if (relayData) {
      for (const agg of relayData.mvRelayDailies.groupedAggregates) {
        relayMap.set(agg.keys[0], { cu: agg.sum.cu, relays: agg.sum.relays });
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

  // GET /specs/:specId/stakes — chain RPC
  app.get<{ Params: { specId: string } }>("/:specId/stakes", { config: { cacheTTL: 300 } }, async (request) => {
    const { specId } = request.params;
    const providers = await fetchProvidersForSpec(specId);

    return {
      data: providers.map((p) => ({
        provider: p.address,
        moniker: p.moniker,
        stake: p.stake?.amount ?? "0",
        delegation: p.delegate_total?.amount ?? "0",
        delegateCommission: p.delegate_commission,
        geolocation: p.geolocation,
      })),
    };
  });

  // GET /specs/:specId/health — from Redis
  app.get<{ Params: { specId: string } }>("/:specId/health", { config: { cacheTTL: 30 } }, async (request) => {
    const { specId } = request.params;

    if (!app.redis) {
      return { data: [] };
    }

    const summary = await readHealthSummaryForSpec(app.redis, specId);
    return { data: summary };
  });

  // GET /specs/:specId/charts — indexer GraphQL (materialized view)
  app.get<{ Params: { specId: string } }>("/:specId/charts", { config: { cacheTTL: 300 } }, async (request) => {
    const { specId } = request.params;

    const data = await gqlSafe<{
      mvRelayDailies: {
        groupedAggregates: Array<{ keys: string[]; sum: { cu: string; relays: string } }>;
      };
    } | null>(`query($chainId: String!) {
      mvRelayDailies(filter: { chainId: { equalTo: $chainId } }) {
        groupedAggregates(groupBy: CHAIN_ID) {
          keys
          sum { cu relays }
        }
      }
    }`, { chainId: specId }, null);

    if (!data) return { data: [] };

    return {
      data: data.mvRelayDailies.groupedAggregates.map((g) => ({
        chainId: g.keys[0],
        cu: g.sum.cu,
        relays: g.sum.relays,
      })),
    };
  });

  // GET /specs/:specId/tracked-info — chain RPC
  app.get<{ Params: { specId: string } }>("/:specId/tracked-info", { config: { cacheTTL: 300 } }, async (request) => {
    const { specId } = request.params;
    const rewards = await fetchIprpcSpecRewards(specId);
    return { data: rewards };
  });
}
