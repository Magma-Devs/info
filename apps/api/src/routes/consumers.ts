import type { FastifyInstance } from "fastify";
import { gqlSafe } from "../graphql/client.js";
import { fetchSubscriptionList } from "../rpc/lava.js";

const EMPTY_PAGE = { nodes: [] as unknown[], totalCount: 0 };

export async function consumerRoutes(app: FastifyInstance) {
  // GET /consumers — indexer GraphQL + chain RPC
  app.get("/", { config: { cacheTTL: 60 } }, async (request) => {
    const { page, limit } = request.pagination;

    const [data, subs] = await Promise.all([
      gqlSafe<{
        mvConsumerRelayDailies: {
          groupedAggregates: Array<{ keys: string[]; sum: { cu: string; relays: string } }>;
        };
      } | null>(`{
        mvConsumerRelayDailies(filter: { consumer: { notEqualTo: "" } }) {
          groupedAggregates(groupBy: CONSUMER) {
            keys
            sum { cu relays }
          }
        }
      }`, undefined, null),
      fetchSubscriptionList(),
    ]);
    const subsMap = new Map<string, string>(subs.map((s) => [s.consumer, s.plan]));

    const consumers = data
      ? data.mvConsumerRelayDailies.groupedAggregates
          .map((g) => ({ consumer: g.keys[0], totalCu: g.sum.cu, totalRelays: g.sum.relays, plan: subsMap.get(g.keys[0]) ?? "" }))
          .filter((c) => c.consumer)
          .sort((a, b) => Number(BigInt(b.totalCu) - BigInt(a.totalCu)))
      : subs.map((s) => ({ consumer: s.consumer, totalCu: null as string | null, totalRelays: null as string | null, plan: s.plan }));

    const total = consumers.length;
    const offset = (page - 1) * limit;
    const paged = consumers.slice(offset, offset + limit);

    return { data: paged, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  });

  // GET /consumers/:addr — indexer GraphQL
  app.get<{ Params: { addr: string } }>("/:addr", { config: { cacheTTL: 30 } }, async (request) => {
    const { addr } = request.params;

    const data = await gqlSafe<{
      mvConsumerRelayDailies: { aggregates: { sum: { cu: string; relays: string } } };
    } | null>(`query($consumer: String!) {
      mvConsumerRelayDailies(filter: { consumer: { equalTo: $consumer } }) {
        aggregates { sum { cu relays } }
      }
    }`, { consumer: addr }, null);

    return {
      consumer: addr,
      totalCu: data?.mvConsumerRelayDailies.aggregates.sum.cu ?? null,
      totalRelays: data?.mvConsumerRelayDailies.aggregates.sum.relays ?? null,
    };
  });

  // GET /consumers/:addr/subscriptions — chain RPC
  app.get<{ Params: { addr: string } }>("/:addr/subscriptions", { config: { cacheTTL: 300 } }, async (request) => {
    const { addr } = request.params;
    const allSubs = await fetchSubscriptionList();
    const filtered = allSubs.filter((s) => s.consumer === addr);
    return { data: filtered };
  });

  // GET /consumers/:addr/events — indexer GraphQL
  app.get<{ Params: { addr: string } }>("/:addr/events", async (request) => {
    const { addr } = request.params;
    const { page, limit } = request.pagination;

    const data = await gqlSafe<{
      blockchainEvents: { nodes: unknown[]; totalCount: number };
    }>(`query($consumer: String!, $first: Int!, $offset: Int!) {
      blockchainEvents(
        filter: { consumer: { equalTo: $consumer } }
        orderBy: BLOCK_HEIGHT_DESC
        first: $first
        offset: $offset
      ) {
        nodes { id eventType consumer specId blockHeight timestamp data }
        totalCount
      }
    }`, { consumer: addr, first: limit, offset: (page - 1) * limit }, { blockchainEvents: EMPTY_PAGE });

    const total = data.blockchainEvents.totalCount;
    return { data: data.blockchainEvents.nodes, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  });

  // GET /consumers/:addr/conflicts — indexer GraphQL
  app.get<{ Params: { addr: string } }>("/:addr/conflicts", { config: { cacheTTL: 10 } }, async (request) => {
    const { addr } = request.params;

    const data = await gqlSafe<{
      conflictResponses: { nodes: unknown[] };
    }>(`query($consumer: String!) {
      conflictResponses(
        filter: { consumer: { equalTo: $consumer } }
        orderBy: BLOCK_HEIGHT_DESC
        first: 100
      ) {
        nodes { id consumer specId voteId requestBlock apiInterface blockHeight timestamp }
      }
    }`, { consumer: addr }, { conflictResponses: { nodes: [] } });

    return { data: data.conflictResponses.nodes };
  });

  // GET /consumers/:addr/charts — indexer GraphQL (materialized view)
  app.get<{ Params: { addr: string } }>("/:addr/charts", { config: { cacheTTL: 300 } }, async (request) => {
    const { addr } = request.params;
    const query = request.query as Record<string, string>;
    const chain = query.chain;

    const to = query.to ? query.to : new Date().toISOString().slice(0, 10);
    const from = query.from
      ? query.from
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const filterParts = [
      `consumer: { equalTo: $consumer }`,
      `date: { greaterThanOrEqualTo: $from, lessThanOrEqualTo: $to }`,
    ];
    const varDefs = [`$consumer: String!`, `$from: Date!`, `$to: Date!`];
    const vars: Record<string, unknown> = { consumer: addr, from, to };

    if (chain) {
      filterParts.push(`chainId: { equalTo: $chain }`);
      varDefs.push(`$chain: String!`);
      vars.chain = chain;
    }

    const data = await gqlSafe<{
      mvConsumerRelayDailies: {
        nodes: Array<{
          date: string; chainId: string; cu: string; relays: string;
          qosSyncW: number | null; qosAvailW: number | null; qosLatencyW: number | null; qosWeight: string;
        }>;
      };
    } | null>(`query(${varDefs.join(", ")}) {
      mvConsumerRelayDailies(
        filter: { ${filterParts.join(", ")} }
        orderBy: DATE_ASC
      ) {
        nodes { date chainId cu relays qosSyncW qosAvailW qosLatencyW qosWeight }
      }
    }`, vars, null);

    if (!data) return { data: [] };

    return {
      data: data.mvConsumerRelayDailies.nodes.map((n) => {
        const w = Number(n.qosWeight);
        return {
          date: n.date,
          chainId: n.chainId,
          cu: n.cu,
          relays: n.relays,
          qosSync: w > 0 ? (n.qosSyncW ?? 0) / w : null,
          qosAvailability: w > 0 ? (n.qosAvailW ?? 0) / w : null,
          qosLatency: w > 0 ? (n.qosLatencyW ?? 0) / w : null,
        };
      }),
    };
  });
}
