import type { FastifyInstance } from "fastify";
import { gql } from "../graphql/client.js";

export async function eventRoutes(app: FastifyInstance) {
  // GET /events?type=events|rewards|reports
  app.get("/", async (request) => {
    const { page, limit } = request.pagination;
    const query = request.query as Record<string, string>;
    const type = query.type ?? "events";
    const offset = (page - 1) * limit;

    if (type === "rewards") {
      const data = await gql<{
        relayPayments: { nodes: unknown[]; totalCount: number };
      }>(`query($first: Int!, $offset: Int!) {
        relayPayments(orderBy: TIMESTAMP_DESC, first: $first, offset: $offset) {
          nodes { id provider consumer chainId cu rewardedCu relayNumber qosScore qosSync qosAvailability qosLatency excellenceQosSync excellenceQosAvailability excellenceQosLatency timestamp }
          totalCount
        }
      }`, { first: limit, offset });

      const total = data.relayPayments.totalCount;
      return { data: data.relayPayments.nodes, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
    }

    if (type === "reports") {
      const data = await gql<{
        providerReports: { nodes: unknown[]; totalCount: number };
      }>(`query($first: Int!, $offset: Int!) {
        providerReports(orderBy: BLOCK_HEIGHT_DESC, first: $first, offset: $offset) {
          nodes { id provider chainId cu errors disconnections epoch blockHeight timestamp }
          totalCount
        }
      }`, { first: limit, offset });

      const total = data.providerReports.totalCount;
      return { data: data.providerReports.nodes, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
    }

    // Default: blockchain events
    const data = await gql<{
      blockchainEvents: { nodes: unknown[]; totalCount: number };
    }>(`query($first: Int!, $offset: Int!) {
      blockchainEvents(orderBy: BLOCK_HEIGHT_DESC, first: $first, offset: $offset) {
        nodes { id eventType provider consumer specId amount blockHeight timestamp data }
        totalCount
      }
    }`, { first: limit, offset });

    const total = data.blockchainEvents.totalCount;
    return { data: data.blockchainEvents.nodes, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  });
}
