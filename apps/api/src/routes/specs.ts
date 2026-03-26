import type { FastifyInstance } from "fastify";
import { gql } from "../graphql/client.js";
import { fetchAllSpecs, fetchProvidersForSpec, fetchIprpcSpecRewards } from "../rpc/lava.js";

export async function specRoutes(app: FastifyInstance) {
  // GET /specs — from chain RPC
  app.get("/", { config: { cacheTTL: 300 } }, async () => {
    const specs = await fetchAllSpecs();
    const specProviders = await Promise.all(
      specs.map((s) =>
        fetchProvidersForSpec(s.index)
          .then((ps) => ({
            specId: s.index,
            name: s.name,
            providerCount: ps.length,
            totalStake: ps.reduce((sum, p) => sum + BigInt(p.stake?.amount ?? "0"), 0n).toString(),
          }))
          .catch(() => ({ specId: s.index, name: s.name, providerCount: 0, totalStake: "0" })),
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

  // GET /specs/:specId/charts — from indexer GraphQL
  app.get<{ Params: { specId: string } }>("/:specId/charts", { config: { cacheTTL: 300 } }, async (request) => {
    const { specId } = request.params;

    const data = await gql<{
      relayPayments: {
        groupedAggregates: Array<{ keys: string[]; sum: { cu: string; relayNumber: string } }>;
      };
    }>(`query($chainId: String!) {
      relayPayments(filter: { chainId: { equalTo: $chainId } }) {
        groupedAggregates(groupBy: CHAIN_ID) {
          keys
          sum { cu relayNumber }
        }
      }
    }`, { chainId: specId });

    return {
      data: data.relayPayments.groupedAggregates.map((g) => ({
        chainId: g.keys[0],
        cu: g.sum.cu,
        relays: g.sum.relayNumber,
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
