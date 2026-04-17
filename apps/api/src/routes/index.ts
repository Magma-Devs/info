import type { FastifyInstance } from "fastify";
import { CACHE_TTL } from "../config.js";
import { weightedQos } from "@info/shared/utils";
import { gqlSafe } from "../graphql/client.js";
import { fetchLatestBlockHeight, fetchAllProviders } from "../rpc/lava.js";

export async function indexRoutes(app: FastifyInstance) {
  app.get("/stats", {
    schema: {
      tags: ["Index"],
      summary: "Dashboard stats — alltime totals, 30d totals, stake, provider count, latest block",
    },
    config: { cacheTTL: CACHE_TTL.LIST },
  }, async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    type RelayAgg = {
      allMvRelayDailies: {
        aggregates: { sum: { cu: string; relays: string } };
      };
    } | null;

    const [allTimeData, last30dData, latestBlock, providers] = await Promise.all([
      gqlSafe<RelayAgg>(`{
        allMvRelayDailies {
          aggregates { sum { cu relays } }
        }
      }`, undefined, null),
      gqlSafe<RelayAgg>(`query($since: Date!) {
        allMvRelayDailies(filter: { date: { greaterThanOrEqualTo: $since } }) {
          aggregates { sum { cu relays } }
        }
      }`, { since: thirtyDaysAgo }, null),
      fetchLatestBlockHeight(),
      fetchAllProviders(),
    ]);

    const totalStake = providers.reduce(
      (sum, p) => sum + BigInt(p.totalStake) + BigInt(p.totalDelegation),
      0n,
    );

    return {
      totalCu: allTimeData?.allMvRelayDailies.aggregates.sum.cu ?? null,
      totalRelays: allTimeData?.allMvRelayDailies.aggregates.sum.relays ?? null,
      cu30d: last30dData?.allMvRelayDailies.aggregates.sum.cu ?? null,
      relays30d: last30dData?.allMvRelayDailies.aggregates.sum.relays ?? null,
      totalStake: totalStake.toString(),
      activeProviderCount: providers.length,
      latestBlock: latestBlock.height,
      latestBlockTime: latestBlock.time,
    };
  });

  app.get("/top-chains", {
    schema: {
      tags: ["Index"],
      summary: "Top 20 chains by alltime CU",
    },
    config: { cacheTTL: CACHE_TTL.LIST },
  }, async () => {
    const data = await gqlSafe<{
      allMvRelayDailies: {
        groupedAggregates: Array<{ keys: string[]; sum: { cu: string; relays: string } }>;
      };
    } | null>(`{
      allMvRelayDailies {
        groupedAggregates(groupBy: CHAIN_ID) {
          keys
          sum { cu relays }
        }
      }
    }`, undefined, null);

    if (!data) return { data: [] };

    const chains = data.allMvRelayDailies.groupedAggregates
      .map((g) => ({ specId: g.keys[0], totalCu: g.sum.cu, totalRelays: g.sum.relays }))
      .sort((a, b) => Number(BigInt(b.totalCu) - BigInt(a.totalCu)));

    return { data: chains.slice(0, 20) };
  });

  app.get("/charts", {
    schema: {
      tags: ["Index"],
      summary: "Daily time-series per chain (CU, relays, QoS)",
      querystring: {
        type: "object" as const,
        properties: {
          from: { type: "string" as const, description: "Start date (YYYY-MM-DD). Default: 90 days ago" },
          to: { type: "string" as const, description: "End date (YYYY-MM-DD). Default: today" },
        },
      },
    },
    config: { cacheTTL: CACHE_TTL.LIST },
  }, async (request) => {
    const q = request.query as Record<string, string>;
    const to = q.to ? q.to : new Date().toISOString().slice(0, 10);
    const from = q.from
      ? q.from
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const data = await gqlSafe<{
      allMvRelayDailies: {
        nodes: Array<{
          date: string; chainId: string; cu: string; relays: string;
          qosSyncW: number | null; qosAvailW: number | null; qosLatencyW: number | null; qosWeight: string;
        }>;
      };
    } | null>(`query($from: Date!, $to: Date!) {
      allMvRelayDailies(
        filter: {
          date: { greaterThanOrEqualTo: $from, lessThanOrEqualTo: $to }
        }
        orderBy: DATE_ASC
      ) {
        nodes { date chainId cu relays qosSyncW qosAvailW qosLatencyW qosWeight }
      }
    }`, { from, to }, null);

    if (!data) return { data: [] };

    const byDayChain = new Map<string, {
      cu: bigint; relays: bigint;
      qosSyncW: number; qosAvailW: number; qosLatW: number; qosWeight: number;
    }>();

    for (const n of data.allMvRelayDailies.nodes) {
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
      const [date = "", chainId = ""] = key.split("|");
      result.push({
        date, chainId,
        cu: v.cu.toString(),
        relays: v.relays.toString(),
        ...weightedQos(v.qosSyncW, v.qosAvailW, v.qosLatW, v.qosWeight),
      });
    }

    result.sort((a, b) => a.date.localeCompare(b.date));
    return { data: result };
  });
}
