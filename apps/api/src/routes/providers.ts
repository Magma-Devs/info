import type { FastifyInstance } from "fastify";
import { gqlSafe } from "../graphql/client.js";
import {
  fetchAllProviders,
  fetchProvidersForSpec,
  fetchAllSpecs,
  fetchProviderAvatar,
  fetchDelegatorRewards,
} from "../rpc/lava.js";
import { readHealthForProvider, readHealthMapForProvider } from "../services/health-store.js";

const EMPTY_PAGE = { nodes: [] as unknown[], totalCount: 0 };

export async function providerRoutes(app: FastifyInstance) {
  // GET /providers — chain RPC + indexer relay data
  app.get("/", { config: { cacheTTL: 300 } }, async (request) => {
    const { page, limit, offset } = request.pagination;

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const [providers, relayData] = await Promise.all([
      fetchAllProviders(),
      gqlSafe<{
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
      }`, { since }, null),
    ]);

    const relayMap = new Map<string, { cu: string; relays: string }>();
    if (relayData) {
      for (const agg of relayData.mvRelayDailies.groupedAggregates) {
        relayMap.set(agg.keys[0], { cu: agg.sum.cu, relays: agg.sum.relays });
      }
    }

    const total = providers.length;
    providers.sort((a, b) => {
      const diff = BigInt(b.totalStake) - BigInt(a.totalStake);
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    });
    const paged = providers.slice(offset, offset + limit);

    return {
      data: paged.map((p) => {
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
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  });

  // GET /providers/:addr — chain RPC
  app.get<{ Params: { addr: string } }>("/:addr", { config: { cacheTTL: 300 } }, async (request) => {
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

    // Attach health data from Redis
    const healthMap = app.redis
      ? await readHealthMapForProvider(app.redis, addr)
      : new Map();

    return {
      provider: addr,
      moniker,
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
  app.get<{ Params: { addr: string } }>("/:addr/stakes", { config: { cacheTTL: 300 } }, async (request) => {
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

  // GET /providers/:addr/health — from Redis
  app.get<{ Params: { addr: string } }>("/:addr/health", { config: { cacheTTL: 30 } }, async (request) => {
    const { addr } = request.params;
    const { page, limit } = request.pagination;

    if (!app.redis) {
      return { data: [], pagination: { total: 0, page, limit, pages: 0 } };
    }

    const result = await readHealthForProvider(app.redis, addr, page, limit);
    const total = result.total;
    return { data: result.data, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  });

  // GET /providers/:addr/events — indexer GraphQL
  app.get<{ Params: { addr: string } }>("/:addr/events", async (request) => {
    const { addr } = request.params;
    const { page, limit } = request.pagination;

    const data = await gqlSafe<{
      blockchainEvents: { nodes: unknown[]; totalCount: number };
    }>(`query($provider: String!, $first: Int!, $offset: Int!) {
      blockchainEvents(
        filter: { provider: { equalTo: $provider } }
        orderBy: BLOCK_HEIGHT_DESC
        first: $first
        offset: $offset
      ) {
        nodes { id eventType provider specId amount blockHeight timestamp data }
        totalCount
      }
    }`, { provider: addr, first: limit, offset: (page - 1) * limit }, { blockchainEvents: EMPTY_PAGE });

    const total = data.blockchainEvents.totalCount;
    return { data: data.blockchainEvents.nodes, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  });

  // GET /providers/:addr/rewards — indexer GraphQL
  app.get<{ Params: { addr: string } }>("/:addr/rewards", async (request) => {
    const { addr } = request.params;
    const { page, limit } = request.pagination;

    const data = await gqlSafe<{
      relayPayments: { nodes: unknown[]; totalCount: number };
    }>(`query($provider: String!, $first: Int!, $offset: Int!) {
      relayPayments(
        filter: { provider: { equalTo: $provider } }
        orderBy: TIMESTAMP_DESC
        first: $first
        offset: $offset
      ) {
        nodes { id provider consumer chainId cu rewardedCu relayNumber qosScore qosSync qosAvailability qosLatency excellenceQosSync excellenceQosAvailability excellenceQosLatency timestamp }
        totalCount
      }
    }`, { provider: addr, first: limit, offset: (page - 1) * limit }, { relayPayments: EMPTY_PAGE });

    const total = data.relayPayments.totalCount;
    return { data: data.relayPayments.nodes, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  });

  // GET /providers/:addr/reports — indexer GraphQL
  app.get<{ Params: { addr: string } }>("/:addr/reports", async (request) => {
    const { addr } = request.params;
    const { page, limit } = request.pagination;

    const data = await gqlSafe<{
      providerReports: { nodes: unknown[]; totalCount: number };
    }>(`query($provider: String!, $first: Int!, $offset: Int!) {
      providerReports(
        filter: { provider: { equalTo: $provider } }
        orderBy: BLOCK_HEIGHT_DESC
        first: $first
        offset: $offset
      ) {
        nodes { id provider chainId cu errors disconnections epoch blockHeight timestamp }
        totalCount
      }
    }`, { provider: addr, first: limit, offset: (page - 1) * limit }, { providerReports: EMPTY_PAGE });

    const total = data.providerReports.totalCount;
    return { data: data.providerReports.nodes, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  });

  // GET /providers/:addr/charts — indexer GraphQL (materialized view)
  app.get<{ Params: { addr: string } }>("/:addr/charts", { config: { cacheTTL: 300 } }, async (request) => {
    const { addr } = request.params;
    const query = request.query as Record<string, string>;
    const chain = query.chain;

    // If no date params, return alltime summary by chain
    if (!query.from && !query.to && !chain) {
      const data = await gqlSafe<{
        mvRelayDailies: {
          groupedAggregates: Array<{ keys: string[]; sum: { cu: string; relays: string } }>;
        };
      } | null>(`query($provider: String!) {
        mvRelayDailies(filter: { provider: { equalTo: $provider } }) {
          groupedAggregates(groupBy: CHAIN_ID) {
            keys
            sum { cu relays }
          }
        }
      }`, { provider: addr }, null);

      if (!data) return { data: [] };

      return {
        data: data.mvRelayDailies.groupedAggregates.map((g) => ({
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
      mvRelayDailies: {
        nodes: Array<{
          date: string; chainId: string; cu: string; relays: string;
          qosSyncW: number | null; qosAvailW: number | null; qosLatencyW: number | null; qosWeight: string;
          exQosSyncW: number | null; exQosAvailW: number | null; exQosLatencyW: number | null; exQosWeight: string;
        }>;
      };
    } | null>(`query(${varDefs.join(", ")}) {
      mvRelayDailies(
        filter: { ${filterParts.join(", ")} }
        orderBy: DATE_ASC
      ) {
        nodes { date chainId cu relays qosSyncW qosAvailW qosLatencyW qosWeight exQosSyncW exQosAvailW exQosLatencyW exQosWeight }
      }
    }`, vars, null);

    if (!data) return { data: [] };

    return {
      data: data.mvRelayDailies.nodes.map((n) => {
        const w = Number(n.qosWeight);
        const ew = Number(n.exQosWeight);
        return {
          date: n.date,
          chainId: n.chainId,
          cu: n.cu,
          relays: n.relays,
          qosSync: w > 0 ? (n.qosSyncW ?? 0) / w : null,
          qosAvailability: w > 0 ? (n.qosAvailW ?? 0) / w : null,
          qosLatency: w > 0 ? (n.qosLatencyW ?? 0) / w : null,
          excellenceQosSync: ew > 0 ? (n.exQosSyncW ?? 0) / ew : null,
          excellenceQosAvailability: ew > 0 ? (n.exQosAvailW ?? 0) / ew : null,
          excellenceQosLatency: ew > 0 ? (n.exQosLatencyW ?? 0) / ew : null,
        };
      }),
    };
  });

  // GET /providers/:addr/avatar — Keybase API
  app.get<{ Params: { addr: string } }>("/:addr/avatar", { config: { cacheTTL: 86400 } }, async (request) => {
    const { addr } = request.params;
    const query = request.query as Record<string, string>;
    const url = await fetchProviderAvatar(addr, query.identity || undefined);
    return { url };
  });

  // GET /providers/:addr/delegator-rewards — chain RPC
  app.get<{ Params: { addr: string } }>("/:addr/delegator-rewards", { config: { cacheTTL: 300 } }, async (request) => {
    const { addr } = request.params;
    const rewards = await fetchDelegatorRewards(addr);
    return { data: rewards };
  });

  // GET /providers/:addr/block-reports — indexer GraphQL
  app.get<{ Params: { addr: string } }>("/:addr/block-reports", async (request) => {
    const { addr } = request.params;
    const { page, limit } = request.pagination;

    const data = await gqlSafe<{
      providerBlockReports: { nodes: unknown[]; totalCount: number };
    }>(`query($provider: String!, $first: Int!, $offset: Int!) {
      providerBlockReports(
        filter: { provider: { equalTo: $provider } }
        orderBy: BLOCK_HEIGHT_DESC
        first: $first
        offset: $offset
      ) {
        nodes { id provider chainId chainBlockHeight blockHeight timestamp }
        totalCount
      }
    }`, { provider: addr, first: limit, offset: (page - 1) * limit }, { providerBlockReports: EMPTY_PAGE });

    const total = data.providerBlockReports.totalCount;
    return { data: data.providerBlockReports.nodes, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  });
}
