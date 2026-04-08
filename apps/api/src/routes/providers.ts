import type { FastifyInstance } from "fastify";
import { gql, gqlSafe } from "../graphql/client.js";
import {
  fetchAllProviders,
  fetchProvidersForSpec,
  fetchAllSpecs,
  fetchProviderAvatar,
  fetchDelegatorRewards,
} from "../rpc/lava.js";

export async function providerRoutes(app: FastifyInstance) {
  // GET /providers — from chain RPC + indexer relay data, cached 5 min
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

  // GET /providers/:addr — from chain RPC
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

    return {
      provider: addr,
      moniker,
      stakes: stakes.map((s) => ({
        specId: s!.specId,
        stake: s!.stake?.amount ?? "0",
        delegation: s!.delegate_total?.amount ?? "0",
        moniker: s!.moniker,
        delegateCommission: s!.delegate_commission,
        geolocation: s!.geolocation,
        addons: s!.addons,
        extensions: s!.extensions,
      })),
    };
  });

  // GET /providers/:addr/stakes — from chain RPC
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

  // GET /providers/:addr/health — from indexer GraphQL
  app.get<{ Params: { addr: string } }>("/:addr/health", { config: { cacheTTL: 30 } }, async (request) => {
    const { addr } = request.params;
    const { page, limit } = request.pagination;

    const data = await gql<{
      providerHealths: { nodes: unknown[]; totalCount: number };
    }>(`query($provider: String!, $first: Int!, $offset: Int!) {
      providerHealths(
        filter: { provider: { equalTo: $provider } }
        orderBy: TIMESTAMP_DESC
        first: $first
        offset: $offset
      ) {
        nodes { id provider spec status geolocation interface timestamp data }
        totalCount
      }
    }`, { provider: addr, first: limit, offset: (page - 1) * limit });

    const total = data.providerHealths.totalCount;
    return { data: data.providerHealths.nodes, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  });

  // GET /providers/:addr/events — from indexer GraphQL
  app.get<{ Params: { addr: string } }>("/:addr/events", async (request) => {
    const { addr } = request.params;
    const { page, limit } = request.pagination;

    const data = await gql<{
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
    }`, { provider: addr, first: limit, offset: (page - 1) * limit });

    const total = data.blockchainEvents.totalCount;
    return { data: data.blockchainEvents.nodes, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  });

  // GET /providers/:addr/rewards — from indexer GraphQL
  app.get<{ Params: { addr: string } }>("/:addr/rewards", async (request) => {
    const { addr } = request.params;
    const { page, limit } = request.pagination;

    const data = await gql<{
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
    }`, { provider: addr, first: limit, offset: (page - 1) * limit });

    const total = data.relayPayments.totalCount;
    return { data: data.relayPayments.nodes, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  });

  // GET /providers/:addr/reports — from indexer GraphQL
  app.get<{ Params: { addr: string } }>("/:addr/reports", async (request) => {
    const { addr } = request.params;
    const { page, limit } = request.pagination;

    const data = await gql<{
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
    }`, { provider: addr, first: limit, offset: (page - 1) * limit });

    const total = data.providerReports.totalCount;
    return { data: data.providerReports.nodes, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  });

  // GET /providers/:addr/charts?from=&to=&chain= — time-series with QoS from indexer GraphQL
  app.get<{ Params: { addr: string } }>("/:addr/charts", { config: { cacheTTL: 300 } }, async (request) => {
    const { addr } = request.params;
    const query = request.query as Record<string, string>;
    const chain = query.chain;

    // If no date params, return alltime summary by chain (backwards-compatible)
    if (!query.from && !query.to && !chain) {
      const data = await gql<{
        mvRelayDailies: {
          groupedAggregates: Array<{ keys: string[]; sum: { cu: string; relays: string } }>;
        };
      }>(`query($provider: String!) {
        mvRelayDailies(filter: { provider: { equalTo: $provider } }) {
          groupedAggregates(groupBy: CHAIN_ID) {
            keys
            sum { cu relays }
          }
        }
      }`, { provider: addr });

      return {
        data: data.mvRelayDailies.groupedAggregates.map((g) => ({
          chainId: g.keys[0],
          cu: g.sum.cu,
          relays: g.sum.relays,
        })),
      };
    }

    // Time-series mode — MV is already aggregated by (date, chain, provider)
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

    const data = await gql<{
      mvRelayDailies: {
        nodes: Array<{
          date: string; chainId: string; cu: string; relays: string;
          qosSyncW: number | null; qosAvailW: number | null; qosLatencyW: number | null; qosWeight: string;
          exQosSyncW: number | null; exQosAvailW: number | null; exQosLatencyW: number | null; exQosWeight: string;
        }>;
      };
    }>(`query(${varDefs.join(", ")}) {
      mvRelayDailies(
        filter: { ${filterParts.join(", ")} }
        orderBy: DATE_ASC
      ) {
        nodes { date chainId cu relays qosSyncW qosAvailW qosLatencyW qosWeight exQosSyncW exQosAvailW exQosLatencyW exQosWeight }
      }
    }`, vars);

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

  // GET /providers/:addr/avatar?identity= — from Keybase API, cached 24h
  app.get<{ Params: { addr: string } }>("/:addr/avatar", { config: { cacheTTL: 86400 } }, async (request) => {
    const { addr } = request.params;
    const query = request.query as Record<string, string>;
    const url = await fetchProviderAvatar(addr, query.identity || undefined);
    return { url };
  });

  // GET /providers/:addr/delegator-rewards — from chain RPC
  app.get<{ Params: { addr: string } }>("/:addr/delegator-rewards", { config: { cacheTTL: 300 } }, async (request) => {
    const { addr } = request.params;
    const rewards = await fetchDelegatorRewards(addr);
    return { data: rewards };
  });

  // GET /providers/:addr/block-reports — from indexer GraphQL
  app.get<{ Params: { addr: string } }>("/:addr/block-reports", async (request) => {
    const { addr } = request.params;
    const { page, limit } = request.pagination;

    const data = await gql<{
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
    }`, { provider: addr, first: limit, offset: (page - 1) * limit });

    const total = data.providerBlockReports.totalCount;
    return { data: data.providerBlockReports.nodes, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  });
}

