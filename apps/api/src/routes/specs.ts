import type { FastifyInstance } from "fastify";
import { gql } from "../graphql/client.js";
import { fetchAllSpecs, fetchProvidersForSpec, fetchIprpcSpecRewards } from "../rpc/lava.js";

export async function specRoutes(app: FastifyInstance) {
  // GET /specs — from chain RPC + 30d relay data from MV
  app.get("/", { config: { cacheTTL: 300 } }, async () => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [specs, relayData] = await Promise.all([
      fetchAllSpecs(),
      gql<{
        mvRelayDailies: {
          groupedAggregates: Array<{ keys: string[]; sum: { cu: string; relays: string } }>;
        };
      }>(`query($since: Date!) {
        mvRelayDailies(filter: { date: { greaterThanOrEqualTo: $since } }) {
          groupedAggregates(groupBy: CHAIN_ID) {
            keys
            sum { cu relays }
          }
        }
      }`, { since }),
    ]);

    const relayMap = new Map<string, { cu: string; relays: string }>();
    for (const agg of relayData.mvRelayDailies.groupedAggregates) {
      relayMap.set(agg.keys[0], { cu: agg.sum.cu, relays: agg.sum.relays });
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
              relays30d: relay?.relays ?? "0",
              cu30d: relay?.cu ?? "0",
            };
          })
          .catch(() => ({ specId: s.index, name: s.name, providerCount: 0, relays30d: "0", cu30d: "0" })),
      ),
    );

    return { data: specProviders.sort((a, b) => b.providerCount - a.providerCount) };
  });

  // GET /specs/:specId/stakes — from chain RPC
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

  // GET /specs/:specId/health — from indexer GraphQL
  app.get<{ Params: { specId: string } }>("/:specId/health", { config: { cacheTTL: 30 } }, async (request) => {
    const { specId } = request.params;

    const data = await gql<{
      providerHealths: {
        groupedAggregates: Array<{ keys: string[]; distinctCount: { id: string } }>;
      };
    }>(`query($spec: String!) {
      providerHealths(filter: { spec: { equalTo: $spec } }) {
        groupedAggregates(groupBy: STATUS) {
          keys
          distinctCount { id }
        }
      }
    }`, { spec: specId });

    return {
      data: data.providerHealths.groupedAggregates.map((g) => ({
        status: g.keys[0],
        count: parseInt(g.distinctCount.id),
      })),
    };
  });

  // GET /specs/:specId/charts — from indexer GraphQL (materialized view)
  app.get<{ Params: { specId: string } }>("/:specId/charts", { config: { cacheTTL: 300 } }, async (request) => {
    const { specId } = request.params;

    const data = await gql<{
      mvRelayDailies: {
        groupedAggregates: Array<{ keys: string[]; sum: { cu: string; relays: string } }>;
      };
    }>(`query($chainId: String!) {
      mvRelayDailies(filter: { chainId: { equalTo: $chainId } }) {
        groupedAggregates(groupBy: CHAIN_ID) {
          keys
          sum { cu relays }
        }
      }
    }`, { chainId: specId });

    return {
      data: data.mvRelayDailies.groupedAggregates.map((g) => ({
        chainId: g.keys[0],
        cu: g.sum.cu,
        relays: g.sum.relays,
      })),
    };
  });

  // GET /specs/:specId/tracked-info — from chain RPC
  app.get<{ Params: { specId: string } }>("/:specId/tracked-info", { config: { cacheTTL: 300 } }, async (request) => {
    const { specId } = request.params;
    const rewards = await fetchIprpcSpecRewards(specId);
    return { data: rewards };
  });
}
