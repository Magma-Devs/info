import type { FastifyInstance } from "fastify";
import { CACHE_TTL } from "../config.js";
import { weightedQos } from "@info/shared/utils";
import type { ProviderListItem } from "@info/shared/types";
import { gqlSafe } from "../graphql/client.js";
import {
  fetchAllProviders,
  fetchProvidersForSpec,
  fetchAllSpecs,
  fetchProviderAvatar,
  fetchDelegatorRewards,
} from "../rpc/lava.js";
import { readHealthForProvider, readHealthMapForProvider } from "../services/health-store.js";

const addrSchema = {
  params: {
    type: "object" as const,
    properties: { addr: { type: "string" as const, pattern: "^lava@[a-z0-9]{38,42}$" } },
    required: ["addr"] as const,
  },
};

export async function providerRoutes(app: FastifyInstance) {
  // GET /providers — full provider list with 30d relay stats.
  // Network-wide provider count sits in the tens, so pagination buys nothing
  // and complicates client filtering; return the full array sorted by stake.
  app.get("/", {
    schema: { tags: ["Providers"], summary: "All providers with 30d relay stats, sorted by total stake desc" },
    config: { cacheTTL: CACHE_TTL.LIST },
  }, async (): Promise<{ data: ProviderListItem[] }> => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const [providers, relayData] = await Promise.all([
      fetchAllProviders(),
      gqlSafe<{
        allMvRelayDailies: {
          groupedAggregates: Array<{
            keys: string[];
            sum: { cu: string; relays: string };
          }>;
        };
      } | null>(`query($since: Date!) {
        allMvRelayDailies(filter: { date: { greaterThanOrEqualTo: $since } }) {
          groupedAggregates(groupBy: PROVIDER) {
            keys
            sum { cu relays }
          }
        }
      }`, { since }, null),
    ]);

    const relayMap = new Map<string, { cu: string; relays: string }>();
    if (relayData) {
      for (const agg of relayData.allMvRelayDailies.groupedAggregates) {
        const provider = agg.keys[0];
        if (provider) relayMap.set(provider, { cu: agg.sum.cu, relays: agg.sum.relays });
      }
    }

    providers.sort((a, b) => {
      const diff = BigInt(b.totalStake) - BigInt(a.totalStake);
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    });

    return {
      data: providers.map((p): ProviderListItem => {
        const relay = relayMap.get(p.address);
        return {
          provider: p.address,
          moniker: p.moniker,
          identity: p.identity,
          activeServices: p.specs.length,
          totalStake: p.totalStake,
          totalDelegation: p.totalDelegation,
          commission: p.commission,
          cuSum30d: relay?.cu ?? null,
          relaySum30d: relay?.relays ?? null,
        };
      }),
    };
  });

  // GET /providers/:addr — chain RPC
  app.get<{ Params: { addr: string } }>("/:addr", {
    schema: {
      ...addrSchema,
      tags: ["Providers"],
      summary: "Provider detail — stakes across all specs with health data",
    },
    config: { cacheTTL: CACHE_TTL.LIST },
  }, async (request) => {
    const { addr } = request.params;
    const specs = await fetchAllSpecs();

    const specProviders = await Promise.all(
      specs.map((s) =>
        fetchProvidersForSpec(s.index)
          .then((ps) => {
            const match = ps.find((p) => p.address === addr);
            return match ? { specId: s.index, ...match } : null;
          })
          .catch(() => null),
      ),
    );

    const stakes = specProviders.filter(Boolean);
    const moniker = stakes[0]?.moniker ?? "";
    const identity = stakes.find((s) => s!.identity)?.identity ?? "";

    // Attach health data from Redis (best-effort — don't fail the route)
    let healthMap = new Map<string, unknown>();
    if (app.redis) {
      try {
        healthMap = await readHealthMapForProvider(app.redis, addr);
      } catch {
        // Redis transient error — serve without health data
      }
    }

    return {
      provider: addr,
      moniker,
      identity,
      stakes: stakes.map((s) => {
        const health = healthMap.get(s!.specId) ?? null;
        return {
          specId: s!.specId,
          stake: s!.stake?.amount ?? "0",
          delegation: s!.delegate_total?.amount ?? "0",
          moniker: s!.moniker,
          delegateCommission: s!.delegate_commission,
          geolocation: s!.geolocation,
          addons: s!.addons,
          extensions: s!.extensions,
          health,
        };
      }),
    };
  });

  // GET /providers/:addr/stakes — chain RPC
  app.get<{ Params: { addr: string } }>("/:addr/stakes", {
    schema: {
      ...addrSchema,
      tags: ["Providers"],
      summary: "Provider stakes per spec",
    },
    config: { cacheTTL: CACHE_TTL.LIST },
  }, async (request) => {
    const { addr } = request.params;
    const specs = await fetchAllSpecs();

    const results = await Promise.all(
      specs.map((s) =>
        fetchProvidersForSpec(s.index)
          .then((ps) => {
            const match = ps.find((p) => p.address === addr);
            return match ? {
              specId: s.index,
              stake: match.stake?.amount ?? "0",
              delegation: match.delegate_total?.amount ?? "0",
              delegateCommission: match.delegate_commission,
              geolocation: match.geolocation,
              addons: match.addons,
              extensions: match.extensions,
            } : null;
          })
          .catch(() => null),
      ),
    );

    return { data: results.filter(Boolean) };
  });

  // GET /providers/:addr/health — from Redis (per-interface probe records)
  app.get<{ Params: { addr: string } }>("/:addr/health", {
    schema: {
      ...addrSchema,
      tags: ["Providers"],
      summary: "Provider health probe results",
    },
    config: { cacheTTL: CACHE_TTL.HEALTH_PROBE },
  }, async (request) => {
    const { addr } = request.params;
    if (!app.redis) return { data: [] };

    try {
      const data = await readHealthForProvider(app.redis, addr);
      return { data };
    } catch {
      return { data: [] };
    }
  });

  // GET /providers/:addr/charts — indexer GraphQL (materialized view)
  app.get<{ Params: { addr: string } }>("/:addr/charts", {
    schema: {
      ...addrSchema,
      tags: ["Providers"],
      summary: "Provider relay charts — alltime summary or daily time-series with QoS",
      querystring: {
        type: "object" as const,
        properties: {
          from: { type: "string" as const, description: "Start date (YYYY-MM-DD)" },
          to: { type: "string" as const, description: "End date (YYYY-MM-DD)" },
          chain: { type: "string" as const, description: "Filter by chain/spec ID" },
        },
      },
    },
    config: { cacheTTL: CACHE_TTL.LIST },
  }, async (request) => {
    const { addr } = request.params;
    const query = request.query as Record<string, string>;
    const chain = query.chain;

    // If no date params, return alltime summary by chain
    if (!query.from && !query.to && !chain) {
      const data = await gqlSafe<{
        allMvRelayDailies: {
          groupedAggregates: Array<{ keys: string[]; sum: { cu: string; relays: string } }>;
        };
      } | null>(`query($provider: String!) {
        allMvRelayDailies(filter: { provider: { equalTo: $provider } }) {
          groupedAggregates(groupBy: CHAIN_ID) {
            keys
            sum { cu relays }
          }
        }
      }`, { provider: addr }, null);

      if (!data) return { data: [] };

      return {
        data: data.allMvRelayDailies.groupedAggregates.map((g) => ({
          chainId: g.keys[0],
          cu: g.sum.cu,
          relays: g.sum.relays,
        })),
      };
    }

    // Time-series mode
    const to = query.to ? query.to : new Date().toISOString().slice(0, 10);
    const from = query.from
      ? query.from
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const filterParts = [
      `provider: { equalTo: $provider }`,
      `date: { greaterThanOrEqualTo: $from, lessThanOrEqualTo: $to }`,
    ];
    const varDefs = [`$provider: String!`, `$from: Date!`, `$to: Date!`];
    const vars: Record<string, unknown> = { provider: addr, from, to };

    if (chain) {
      filterParts.push(`chainId: { equalTo: $chain }`);
      varDefs.push(`$chain: String!`);
      vars.chain = chain;
    }

    const data = await gqlSafe<{
      allMvRelayDailies: {
        nodes: Array<{
          date: string; chainId: string; cu: string; relays: string;
          qosSyncW: number | null; qosAvailW: number | null; qosLatencyW: number | null; qosWeight: string;
          exQosSyncW: number | null; exQosAvailW: number | null; exQosLatencyW: number | null; exQosWeight: string;
        }>;
      };
    } | null>(`query(${varDefs.join(", ")}) {
      allMvRelayDailies(
        filter: { ${filterParts.join(", ")} }
        orderBy: DATE_ASC
      ) {
        nodes { date chainId cu relays qosSyncW qosAvailW qosLatencyW qosWeight exQosSyncW exQosAvailW exQosLatencyW exQosWeight }
      }
    }`, vars, null);

    if (!data) return { data: [] };

    return {
      data: data.allMvRelayDailies.nodes.map((n) => {
        const qos = weightedQos(n.qosSyncW, n.qosAvailW, n.qosLatencyW, Number(n.qosWeight));
        const ex = weightedQos(n.exQosSyncW, n.exQosAvailW, n.exQosLatencyW, Number(n.exQosWeight));
        return {
          date: n.date,
          chainId: n.chainId,
          cu: n.cu,
          relays: n.relays,
          qosSync: qos.qosSync,
          qosAvailability: qos.qosAvailability,
          qosLatency: qos.qosLatency,
          excellenceQosSync: ex.qosSync,
          excellenceQosAvailability: ex.qosAvailability,
          excellenceQosLatency: ex.qosLatency,
        };
      }),
    };
  });

  // GET /providers/:addr/avatar — Keybase API
  app.get<{ Params: { addr: string } }>("/:addr/avatar", {
    schema: {
      ...addrSchema,
      tags: ["Providers"],
      summary: "Provider avatar URL from Keybase identity",
      querystring: {
        type: "object" as const,
        properties: {
          identity: { type: "string" as const, description: "Keybase identity hint (skips provider metadata lookup)" },
        },
      },
    },
    config: { cacheTTL: CACHE_TTL.HISTORICAL },
  }, async (request) => {
    const { addr } = request.params;
    const query = request.query as Record<string, string>;
    const url = await fetchProviderAvatar(addr, query.identity || undefined);
    return { url };
  });

  // GET /providers/:addr/delegator-rewards — chain RPC
  app.get<{ Params: { addr: string } }>("/:addr/delegator-rewards", {
    schema: {
      ...addrSchema,
      tags: ["Providers"],
      summary: "Delegator rewards from dualstaking module",
    },
    config: { cacheTTL: CACHE_TTL.LIST },
  }, async (request) => {
    const { addr } = request.params;
    const rewards = await fetchDelegatorRewards(addr);
    return { data: rewards };
  });

}
