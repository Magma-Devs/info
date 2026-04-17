/**
 * Standalone precompute worker.
 *
 * Recomputes the heaviest read-only endpoints on a fixed interval and writes
 * each result to Redis so the API can serve them without ever hitting a cold
 * code path. Prevents cache stampedes when TTLs expire under load.
 *
 * Covered endpoints:
 *   - /supply/circulating        (paginates ~53K accounts)
 *   - /apr                       (per-entity estimated_* RPC calls)
 *   - /all_providers_apr         (per-provider × per-spec)
 *   - /validators-and-rewards    (5 RPC × N validators)
 *
 * Deploy as a separate ECS task / container. The API still falls back to
 * live compute if the precompute key is missing, so this worker can be down
 * without breaking the site — users just see the slower path.
 *
 * Env:
 *   REDIS_URL                      — required
 *   PRECOMPUTE_INTERVAL_MS         — default 900000 (15 min)
 *   LAVA_REST_URL, COINGECKO_API_URL — passed through to the rpc layer
 */
import { Redis } from "ioredis";
import pino from "pino";
import { ulavaToLava } from "@info/shared/utils";
import { config } from "../config.js";
import { gqlSafe } from "../graphql/client.js";
import { fetchCirculatingSupply } from "../rpc/supply.js";
import { computeAPR, computeAllProvidersApr } from "../rpc/apr.js";
import { fetchValidatorsWithRewards } from "../rpc/validators.js";
import { writePrecomputed } from "../services/precompute-store.js";

const log = pino({ name: "precompute" });

async function recomputeCirculatingSupply(redis: Redis): Promise<void> {
  const value = ulavaToLava(await fetchCirculatingSupply());
  await writePrecomputed(redis, "supply.circulating", value);
}

async function recomputeApr(redis: Redis): Promise<void> {
  const apr = await computeAPR(redis);
  await writePrecomputed(redis, "apr", apr);
}

async function recomputeAllProvidersApr(redis: Redis): Promise<void> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const relayData = await gqlSafe<{
    allMvRelayDailies: {
      groupedAggregates: Array<{ keys: string[]; sum: { cu: string; relays: string } }>;
    };
  } | null>(`query($since: Date!) {
    allMvRelayDailies(filter: { date: { greaterThanOrEqualTo: $since } }) {
      groupedAggregates(groupBy: PROVIDER) { keys sum { cu relays } }
    }
  }`, { since }, null);

  const relay30d = new Map<string, { cu: string; relays: string }>();
  if (relayData) {
    for (const agg of relayData.allMvRelayDailies.groupedAggregates) {
      const provider = agg.keys[0];
      if (provider) relay30d.set(provider, { cu: agg.sum.cu, relays: agg.sum.relays });
    }
  }

  const data = await computeAllProvidersApr(relay30d, redis);
  await writePrecomputed(redis, "all_providers_apr", data);
}

async function recomputeValidatorsAndRewards(redis: Redis): Promise<void> {
  const data = await fetchValidatorsWithRewards();
  await writePrecomputed(redis, "validators_and_rewards", data);
}

const TASKS: Array<{ name: string; run: (redis: Redis) => Promise<void> }> = [
  { name: "supply.circulating", run: recomputeCirculatingSupply },
  { name: "apr", run: recomputeApr },
  { name: "all_providers_apr", run: recomputeAllProvidersApr },
  { name: "validators_and_rewards", run: recomputeValidatorsAndRewards },
];

async function runOnce(redis: Redis): Promise<void> {
  for (const task of TASKS) {
    const started = Date.now();
    try {
      await task.run(redis);
      log.info({ task: task.name, ms: Date.now() - started }, "precompute done");
    } catch (err) {
      log.error({ task: task.name, err }, "precompute failed");
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!config.redis.url) {
    log.error("REDIS_URL is required");
    process.exit(1);
  }

  const intervalMs = config.precompute.intervalMs;
  const redis = new Redis(config.redis.url);

  let running = true;
  const shutdown = (signal: string) => {
    log.info({ signal }, "Shutting down precompute worker");
    running = false;
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  log.info({ intervalMs }, "Precompute worker started");

  while (running) {
    await runOnce(redis);
    if (!running) break;
    await sleep(intervalMs);
  }

  await redis.quit();
}

main().catch((err) => {
  log.error({ err }, "Precompute worker crashed");
  process.exit(1);
});
