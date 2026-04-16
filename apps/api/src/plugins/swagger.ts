import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

export const swaggerPlugin = fp(async (app: FastifyInstance) => {
  await app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "Lava Network Explorer API",
        description: "REST API for the Lava Network blockchain explorer. Provides provider, chain (spec), relay, staking, and supply data across Mainnet and Testnet.",
        version: "1.0.0",
      },
      tags: [
        { name: "Index", description: "Dashboard stats, top chains, and time-series charts" },
        { name: "Providers", description: "Provider list, detail, stakes, health, charts, avatar, rewards" },
        { name: "Specs", description: "Chain/spec list, stakes, health, and charts" },
        { name: "Supply", description: "Total and circulating token supply" },
        { name: "TVL", description: "Total Value Locked in USD" },
        { name: "APR", description: "Annual Percentage Rate estimates" },
        { name: "Search", description: "Search providers and specs" },
        { name: "Lava", description: "Raw chain data for frontend consumption" },
        { name: "Health", description: "Service health checks" },
        { name: "Provider Rewards", description: "Per-provider QoS-adjusted reward distribution with USD values" },
        { name: "Validators", description: "Bonded validator list with rewards, delegations, and unbonding — matches jsinfo shape" },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
  });
});
