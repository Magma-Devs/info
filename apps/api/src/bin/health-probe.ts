/**
 * Standalone health-probe worker.
 *
 * Runs the probe loop as its own process so the gRPC probe traffic doesn't
 * share the Fastify API's event loop. Deploy as a separate ECS task (or any
 * container/systemd service).
 *
 * Env:
 *   REDIS_URL                 — required; where to write probe results
 *   HEALTH_PROBE_INTERVAL_MS  — default 30000
 *   LAVA_REST_URL             — passed through to the rpc layer
 *
 * The in-process `healthProbePlugin` is still available for local dev via
 * ENABLE_HEALTH_PROBE=true on the API container.
 */
import { Redis } from "ioredis";
import pino from "pino";
import { runProbeLoop } from "../services/health-probe-loop.js";

const log = pino({ name: "health-probe-bin" });

async function main() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    log.error("REDIS_URL is required");
    process.exit(1);
  }

  const redis = new Redis(redisUrl);

  let running = true;
  const shutdown = (signal: string) => {
    log.info({ signal }, "Shutting down health probe");
    running = false;
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  try {
    await runProbeLoop({ redis, isRunning: () => running });
  } finally {
    await redis.quit();
  }
}

main().catch((err) => {
  log.error({ err }, "Health probe worker crashed");
  process.exit(1);
});
