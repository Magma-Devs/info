import type { FastifyInstance } from "fastify";
import { gql } from "../graphql/client.js";
import { fetchSubscriptionList } from "../rpc/lava.js";

export async function consumerRoutes(app: FastifyInstance) {
  // GET /consumers — from indexer GraphQL (aggregated relay payments)
  app.get("/", { config: { cacheTTL: 60 } }, async (request) => {
    const { page, limit } = request.pagination;

    const data = await gql<{
      relayPayments: {
        groupedAggregates: Array<{ keys: string[]; sum: { cu: string; relayNumber: string } }>;
      };
    }>(`{
      relayPayments(filter: { consumer: { isNull: false } }) {
        groupedAggregates(groupBy: CONSUMER) {
          keys
          sum { cu relayNumber }
        }
      }
    }`);

    const consumers = data.relayPayments.groupedAggregates
      .map((g) => ({ consumer: g.keys[0], totalCu: g.sum.cu, totalRelays: g.sum.relayNumber }))
      .filter((c) => c.consumer)
      .sort((a, b) => Number(BigInt(b.totalCu) - BigInt(a.totalCu)));

    const total = consumers.length;
    const offset = (page - 1) * limit;
    const paged = consumers.slice(offset, offset + limit);

    return { data: paged, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  });

  // GET /consumers/:addr — from indexer GraphQL
  app.get<{ Params: { addr: string } }>("/:addr", { config: { cacheTTL: 30 } }, async (request) => {
    const { addr } = request.params;

    const data = await gql<{
      relayPayments: { aggregates: { sum: { cu: string; relayNumber: string } } };
    }>(`query($consumer: String!) {
      relayPayments(filter: { consumer: { equalTo: $consumer } }) {
        aggregates { sum { cu relayNumber } }
      }
    }`, { consumer: addr });

    return {
      consumer: addr,
      totalCu: data.relayPayments.aggregates.sum.cu ?? "0",
      totalRelays: data.relayPayments.aggregates.sum.relayNumber ?? "0",
    };
  });

  // GET /consumers/:addr/subscriptions — from chain RPC
  app.get<{ Params: { addr: string } }>("/:addr/subscriptions", { config: { cacheTTL: 300 } }, async (request) => {
    const { addr } = request.params;
    const allSubs = await fetchSubscriptionList();
    const filtered = allSubs.filter((s) => s.consumer === addr);
    return { data: filtered };
  });

  // GET /consumers/:addr/events — from indexer GraphQL
  app.get<{ Params: { addr: string } }>("/:addr/events", async (request) => {
    const { addr } = request.params;
    const { page, limit } = request.pagination;

    const data = await gql<{
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
    }`, { consumer: addr, first: limit, offset: (page - 1) * limit });

    const total = data.blockchainEvents.totalCount;
    return { data: data.blockchainEvents.nodes, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  });

  // GET /consumers/:addr/conflicts — from indexer GraphQL
  app.get<{ Params: { addr: string } }>("/:addr/conflicts", { config: { cacheTTL: 10 } }, async (request) => {
    const { addr } = request.params;

    const data = await gql<{
      conflictResponses: { nodes: unknown[] };
    }>(`query($consumer: String!) {
      conflictResponses(
        filter: { consumer: { equalTo: $consumer } }
        orderBy: BLOCK_HEIGHT_DESC
        first: 100
      ) {
        nodes { id consumer specId voteId requestBlock apiInterface blockHeight timestamp }
      }
    }`, { consumer: addr });

    return { data: data.conflictResponses.nodes };
  });
}
