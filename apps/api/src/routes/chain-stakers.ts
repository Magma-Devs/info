import type { FastifyInstance } from "fastify";
import { CACHE_TTL } from "../config.js";
import { countUniqueDelegators } from "../rpc/lava.js";

// Restored from jsinfo: returns unique delegator counts (current + last-30-days)
// across the dualstaking module. Stakers includes the `empty_provider` bucket
// (validator-only delegators); restakers does not.
const responseSchema = {
  type: "object",
  properties: {
    total: { type: "string" },
    monthly: { type: "string" },
  },
  required: ["total", "monthly"],
} as const;

export async function chainStakersRoutes(app: FastifyInstance) {
  app.get("/lava_chain_stakers", {
    schema: {
      tags: ["Chain Wallet"],
      summary: "Unique stakers (provider + validator-only delegators)",
      response: { 200: responseSchema },
    },
    config: { cacheTTL: CACHE_TTL.LIST },
  }, async () => countUniqueDelegators(true));

  app.get("/lava_chain_restakers", {
    schema: {
      tags: ["Chain Wallet"],
      summary: "Unique restakers (delegators that picked a provider)",
      response: { 200: responseSchema },
    },
    config: { cacheTTL: CACHE_TTL.LIST },
  }, async () => countUniqueDelegators(false));
}
