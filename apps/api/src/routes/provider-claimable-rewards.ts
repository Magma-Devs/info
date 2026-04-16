import type { FastifyInstance } from "fastify";
import {
  RPC_BATCH_SIZE,
  fetchAllProviders,
  fetchDelegatorRewards,
  prewarmPriceCache,
  processClaimableRewards,
  type ClaimableRewardEntry,
} from "../rpc/lava.js";

export async function providerClaimableRewardsRoutes(app: FastifyInstance) {
  // Replaces jsinfo's /lava_mainnet_provider_claimable_rewards. Iterates all
  // active providers, reads their self-delegation rewards via dualstaking RPC,
  // and converts each denom to USD via CoinGecko.
  app.get("/provider-claimable-rewards", {
    schema: {
      tags: ["Provider Rewards"],
      summary: "Per-provider self-delegation claimable rewards (multi-denom + USD)",
    },
    config: { cacheTTL: 7200 },
  }, async () => {
    await prewarmPriceCache();
    const providers = await fetchAllProviders();
    const out: Record<string, { rewards: ClaimableRewardEntry[]; timestamp: string }> = {};
    const ts = new Date().toISOString();

    for (let i = 0; i < providers.length; i += RPC_BATCH_SIZE) {
      const batch = providers.slice(i, i + RPC_BATCH_SIZE);
      const results = await Promise.all(
        batch.map((p) => fetchDelegatorRewards(p.address)),
      );
      for (let j = 0; j < batch.length; j++) {
        const addr = batch[j]!.address;
        const entries = await processClaimableRewards(results[j]!, addr);
        if (entries.length > 0) {
          out[addr] = { rewards: entries, timestamp: ts };
        }
      }
    }

    return { providers: out };
  });
}
