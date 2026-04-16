import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import compress from "@fastify/compress";
import { redisPlugin } from "./plugins/redis.js";
import { cachePlugin } from "./plugins/cache.js";
import { errorHandlerPlugin } from "./plugins/error-handler.js";
import { swaggerPlugin } from "./plugins/swagger.js";
import { healthProbePlugin } from "./plugins/health-probe.js";
import { healthRoutes } from "./routes/health.js";
import { indexRoutes } from "./routes/index.js";
import { providerRoutes } from "./routes/providers.js";
import { specRoutes } from "./routes/specs.js";
import { supplyRoutes } from "./routes/supply.js";
import { tvlRoutes } from "./routes/tvl.js";
import { aprRoutes } from "./routes/apr.js";
import { searchRoutes } from "./routes/search.js";
import { lavaRoutes } from "./routes/lava.js";
import { allProvidersAprRoutes } from "./routes/all-providers-apr.js";
import { relaysDbPlugin } from "./plugins/relays-db.js";
import { optimizerMetricsRoutes } from "./routes/optimizer-metrics.js";
import { providerRewardsRoutes } from "./routes/provider-rewards.js";
import { providerEstimatedRewardsRoutes } from "./routes/provider-estimated-rewards.js";
import { providerClaimableRewardsRoutes } from "./routes/provider-claimable-rewards.js";
import { validatorsAndRewardsRoutes } from "./routes/validators-and-rewards.js";
import { burnRateRoutes } from "./routes/burn-rate.js";

const PORT = parseInt(process.env.API_PORT ?? "8080", 10);
const HOST = process.env.API_HOST ?? "0.0.0.0";
const CORS_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : true; // default: allow all in dev; set CORS_ORIGINS in production

async function main() {
  const app = Fastify({
    logger: {
      transport:
        process.env.NODE_ENV === "development"
          ? { target: "pino-pretty" }
          : undefined,
    },
  });

  await app.register(cors, { origin: CORS_ORIGINS, methods: ["GET", "HEAD", "OPTIONS", "DELETE"] });
  await app.register(helmet, { contentSecurityPolicy: false }); // CSP handled by Next.js frontend
  await app.register(compress, { global: true, threshold: 1024, encodings: ["br", "gzip"] });
  await app.register(rateLimit, {
    max: parseInt(process.env.RATE_LIMIT_MAX ?? "100", 10),
    timeWindow: "1 minute",
    allowList: ["127.0.0.1", "::1"],
  });
  await app.register(errorHandlerPlugin);
  await app.register(swaggerPlugin);
  await app.register(redisPlugin);
  await app.register(relaysDbPlugin);
  await app.register(cachePlugin);

  await app.register(healthRoutes);
  await app.register(indexRoutes, { prefix: "/index" });
  await app.register(providerRoutes, { prefix: "/providers" });
  await app.register(specRoutes, { prefix: "/specs" });
  await app.register(supplyRoutes, { prefix: "/supply" });
  await app.register(tvlRoutes);
  await app.register(aprRoutes);
  await app.register(allProvidersAprRoutes, { prefix: "/all_providers_apr" });
  await app.register(searchRoutes);
  await app.register(lavaRoutes, { prefix: "/lava" });
  await app.register(optimizerMetricsRoutes);
  await app.register(providerRewardsRoutes);
  await app.register(providerEstimatedRewardsRoutes);
  await app.register(providerClaimableRewardsRoutes);
  await app.register(validatorsAndRewardsRoutes);
  await app.register(burnRateRoutes);

  await app.register(healthProbePlugin);

  await app.listen({ port: PORT, host: HOST });
  app.log.info(`API server listening on ${HOST}:${PORT}`);

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      app.log.info(`Received ${signal}, shutting down`);
      app.close().then(() => process.exit(0));
    });
  }
}

main().catch((err) => {
  console.error("Failed to start API server:", err);
  process.exit(1);
});
