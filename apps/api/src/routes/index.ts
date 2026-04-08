import type { FastifyInstance } from "fastify";
import { gql, gqlSafe } from "../graphql/client.js";
import { fetchLatestBlockHeight, fetchAllProviders } from "../rpc/lava.js";

export async function indexRoutes(app: FastifyInstance) {
  app.get("/stats", { config: { cacheTTL: 60 } }, async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    type RelayAgg = {
      mvRelayDailies: {
        aggregates: { sum: { cu: string; relays: string } };
      };
    } | null;

    const [allTimeData, last30dData, latestBlock, providers] = await Promise.all([
      gqlSafe<RelayAgg>(`{
        mvRelayDailies {
          aggregates { sum { cu relays } }
        }
      }`, undefined, null),
      gqlSafe<RelayAgg>(`query($since: Date!) {
        mvRelayDailies(filter: { date: { greaterThanOrEqualTo: $since } }) {
          aggregates { sum { cu relays } }
        }
      }`, { since: thirtyDaysAgo }, null),
      fetchLatestBlockHeight(),
      fetchAllProviders(),
    ]);

    const totalStake = providers.reduce((sum, p) => sum + BigInt(p.totalStake), 0n);

    return {
      totalCu: allTimeData?.mvRelayDailies.aggregates.sum.cu ?? null,
      totalRelays: allTimeData?.mvRelayDailies.aggregates.sum.relays ?? null,
      cu30d: last30dData?.mvRelayDailies.aggregates.sum.cu ?? null,
      relays30d: last30dData?.mvRelayDailies.aggregates.sum.relays ?? null,
      totalStake: totalStake.toString(),
      activeProviderCount: providers.length,
      latestBlock: latestBlock.height,
      latestBlockTime: latestBlock.time,
    };
  });

  app.get("/top-chains", { config: { cacheTTL: 300 } }, async () => {
    const data = await gql<{
      mvRelayDailies: {
        groupedAggregates: Array<{ keys: string[]; sum: { cu: string; relays: string } }>;
      };
    }>(`{
      mvRelayDailies {
        groupedAggregates(groupBy: CHAIN_ID) {
          keys
          sum { cu relays }
        }
      }
    }`);

    const chains = data.mvRelayDailies.groupedAggregates
      .map((g) => ({ specId: g.keys[0], totalCu: g.sum.cu, totalRelays: g.sum.relays }))
      .sort((a, b) => Number(BigInt(b.totalCu) - BigInt(a.totalCu)));

    return { data: chains.slice(0, 20) };
  });

  // GET /index/charts?from=&to= — daily time-series of CU/relays per chain
  // MV is already aggregated by (date, chain_id, provider), so we just re-aggregate
  // by (date, chain_id) to collapse the provider dimension.
  app.get("/charts", { config: { cacheTTL: 300 } }, async (request) => {
    const q = request.query as Record<string, string>;
    const to = q.to ? q.to : new Date().toISOString().slice(0, 10);
    const from = q.from
      ? q.from
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const data = await gql<{
      mvRelayDailies: {
        nodes: Array<{
          date: string;
          chainId: string;
          cu: string;
          relays: string;
          qosSyncW: number | null;
          qosAvailW: number | null;
          qosLatencyW: number | null;
          qosWeight: string;
        }>;
      };
    }>(`query($from: Date!, $to: Date!) {
      mvRelayDailies(
        filter: {
          date: { greaterThanOrEqualTo: $from, lessThanOrEqualTo: $to }
        }
        orderBy: DATE_ASC
      ) {
        nodes { date chainId cu relays qosSyncW qosAvailW qosLatencyW qosWeight }
      }
    }`, { from, to });

    // Collapse provider dimension: aggregate by (date, chainId)
    const byDayChain = new Map<string, {
      cu: bigint; relays: bigint;
      qosSyncW: number; qosAvailW: number; qosLatW: number; qosWeight: number;
    }>();

    for (const n of data.mvRelayDailies.nodes) {
      const key = `${n.date}|${n.chainId}`;
      const existing = byDayChain.get(key);
      if (existing) {
        existing.cu += BigInt(n.cu);
        existing.relays += BigInt(n.relays);
        existing.qosSyncW += n.qosSyncW ?? 0;
        existing.qosAvailW += n.qosAvailW ?? 0;
        existing.qosLatW += n.qosLatencyW ?? 0;
        existing.qosWeight += Number(n.qosWeight);
      } else {
        byDayChain.set(key, {
          cu: BigInt(n.cu),
          relays: BigInt(n.relays),
          qosSyncW: n.qosSyncW ?? 0,
          qosAvailW: n.qosAvailW ?? 0,
          qosLatW: n.qosLatencyW ?? 0,
          qosWeight: Number(n.qosWeight),
        });
      }
    }

    const result: Array<{
      date: string; chainId: string;
      cu: string; relays: string;
      qosSync: number | null; qosAvailability: number | null; qosLatency: number | null;
    }> = [];

    for (const [key, v] of byDayChain) {
      const [date, chainId] = key.split("|");
      result.push({
        date, chainId,
        cu: v.cu.toString(),
        relays: v.relays.toString(),
        qosSync: v.qosWeight > 0 ? v.qosSyncW / v.qosWeight : null,
        qosAvailability: v.qosWeight > 0 ? v.qosAvailW / v.qosWeight : null,
        qosLatency: v.qosWeight > 0 ? v.qosLatW / v.qosWeight : null,
      });
    }

    result.sort((a, b) => a.date.localeCompare(b.date));
    return { data: result };
  });
}
