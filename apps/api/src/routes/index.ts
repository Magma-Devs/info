import type { FastifyInstance } from "fastify";
import { gql } from "../graphql/client.js";
import { fetchLatestBlockHeight, fetchAllProviders } from "../rpc/lava.js";

export async function indexRoutes(app: FastifyInstance) {
  app.get("/stats", { config: { cacheTTL: 60 } }, async () => {
    const [indexerData, latestBlock, providers] = await Promise.all([
      gql<{
        relayPayments: {
          aggregates: { sum: { cu: string; relayNumber: string } };
        };
      }>(`{
        relayPayments {
          aggregates { sum { cu relayNumber } }
        }
      }`),
      fetchLatestBlockHeight(),
      fetchAllProviders(),
    ]);

    const totalStake = providers.reduce((sum, p) => sum + BigInt(p.totalStake), 0n);

    return {
      totalCu: indexerData.relayPayments.aggregates.sum.cu ?? "0",
      totalRelays: indexerData.relayPayments.aggregates.sum.relayNumber ?? "0",
      totalStake: totalStake.toString(),
      activeProviderCount: providers.length,
      latestBlock: latestBlock.height,
      latestBlockTime: latestBlock.time,
    };
  });

  app.get("/top-chains", { config: { cacheTTL: 300 } }, async () => {
    const data = await gql<{
      relayPayments: {
        groupedAggregates: Array<{ keys: string[]; sum: { cu: string; relayNumber: string } }>;
      };
    }>(`{
      relayPayments {
        groupedAggregates(groupBy: CHAIN_ID) {
          keys
          sum { cu relayNumber }
        }
      }
    }`);

    const chains = data.relayPayments.groupedAggregates
      .map((g) => ({ specId: g.keys[0], totalCu: g.sum.cu, totalRelays: g.sum.relayNumber }))
      .sort((a, b) => Number(BigInt(b.totalCu) - BigInt(a.totalCu)));

    return { data: chains.slice(0, 20) };
  });
}
