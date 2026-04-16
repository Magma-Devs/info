import type { FastifyInstance } from "fastify";
import {
  fetchProvidersWithSpecs,
  fetchRewardsBySpec,
  prewarmPriceCache,
  type RewardsBySpecEntry,
} from "../rpc/lava.js";

// ── Route ────────────────────────────────────────────────────────────────────

export async function providerEstimatedRewardsRoutes(app: FastifyInstance) {
  app.get("/provider-estimated-rewards", {
    schema: {
      tags: ["Provider Rewards"],
      summary: "Per-provider actual chain rewards (from estimated_provider_rewards RPC), grouped by spec",
    },
    config: { cacheTTL: 1800 },
  }, async () => {
    // Pre-warm CoinGecko price cache (single batch call for all denoms)
    await prewarmPriceCache();

    const { providers: providerMap, specNames } = await fetchProvidersWithSpecs();
    const addresses = Array.from(providerMap.keys());

    const results: Array<{
      provider: string;
      moniker: string;
      rewards: RewardsBySpecEntry[];
      total_usd: number;
    }> = [];

    // Batch 5 at a time to avoid rate-limiting the chain RPC
    for (let i = 0; i < addresses.length; i += 5) {
      const batch = addresses.slice(i, i + 5);
      const rewardResults = await Promise.all(
        batch.map((addr) => fetchRewardsBySpec(addr, specNames)),
      );

      for (let j = 0; j < batch.length; j++) {
        const addr = batch[j];
        const provider = providerMap.get(addr)!;
        const rewards = rewardResults[j];
        const totalUsd = rewards.reduce((sum, r) => sum + r.total_usd, 0);

        if (rewards.length > 0) {
          results.push({
            provider: addr,
            moniker: provider.moniker || "-",
            rewards,
            total_usd: totalUsd,
          });
        }
      }
    }

    results.sort((a, b) => b.total_usd - a.total_usd);

    return { data: results };
  });
}
