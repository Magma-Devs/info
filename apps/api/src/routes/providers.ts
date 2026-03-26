import type { FastifyInstance } from "fastify";
import { gql } from "../graphql/client.js";
import { fetchAllProviders, fetchProvidersForSpec, fetchAllSpecs } from "../rpc/lava.js";

export async function providerRoutes(app: FastifyInstance) {
  // GET /providers — from chain RPC, cached 5 min
  app.get("/", { config: { cacheTTL: 300 } }, async (request) => {
    const { page, limit, offset } = request.pagination;
    const providers = await fetchAllProviders();

    const total = providers.length;
    providers.sort((a, b) => {
      const diff = BigInt(b.totalStake) - BigInt(a.totalStake);
      return diff > 0n ? 1 : diff < 0n ? -1 : 0;
    });
    const paged = providers.slice(offset, offset + limit);

    return {
      data: paged.map((p) => ({
        provider: p.address,
        moniker: p.moniker,
        activeServices: p.specs.length,
        totalStake: p.totalStake,
        totalDelegation: p.totalDelegation,
      })),
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
            return match ? { specId: s.index, stake: match.stake?.amount ?? "0", delegation: match.delegate_total?.amount ?? "0" } : null;
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
        nodes { id provider chainId cu rewardedCu relayNumber qosScore timestamp }
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

  // GET /providers/:addr/charts — from indexer GraphQL (grouped relay payments)
  app.get<{ Params: { addr: string } }>("/:addr/charts", { config: { cacheTTL: 300 } }, async (request) => {
    const { addr } = request.params;

    const data = await gql<{
      relayPayments: {
        groupedAggregates: Array<{ keys: string[]; sum: { cu: string; relayNumber: string } }>;
      };
    }>(`query($provider: String!) {
      relayPayments(filter: { provider: { equalTo: $provider } }) {
        groupedAggregates(groupBy: CHAIN_ID) {
          keys
          sum { cu relayNumber }
        }
      }
    }`, { provider: addr });

    return {
      data: data.relayPayments.groupedAggregates.map((g) => ({
        chainId: g.keys[0],
        cu: g.sum.cu,
        relays: g.sum.relayNumber,
      })),
    };
  });
}
