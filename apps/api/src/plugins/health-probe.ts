import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { runProbeLoop } from "../services/health-probe-loop.js";

/**
 * Optional in-process health-probe runner for local dev / single-node setups.
 *
 * Production deployments should run the probe as a separate process via
 * `apps/api/src/bin/health-probe.ts` (own ECS task / container) so gRPC probe
 * traffic doesn't share the API's event loop. This plugin stays opt-in for
 * convenience during local dev: set `ENABLE_HEALTH_PROBE=true` to enable.
 */
export const healthProbePlugin = fp(async (app: FastifyInstance) => {
  if (process.env.ENABLE_HEALTH_PROBE !== "true") return;
  if (!app.redis) {
    app.log.warn("Health probe requires Redis — REDIS_URL not set, skipping");
    return;
  }

  let running = true;

  app.addHook("onClose", () => {
    running = false;
  });

  app.addHook("onReady", () => {
    const redis = app.redis!;
    void runProbeLoop({ redis, isRunning: () => running });
  });
});
