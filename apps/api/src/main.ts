import Fastify from "fastify";
import cors from "@fastify/cors";
import { redisPlugin } from "./plugins/redis.js";
import { cachePlugin } from "./plugins/cache.js";
import { paginationPlugin } from "./plugins/pagination.js";
import { csvPlugin } from "./plugins/csv.js";
import { errorHandlerPlugin } from "./plugins/error-handler.js";
import { healthProbePlugin } from "./plugins/health-probe.js";
import { healthRoutes } from "./routes/health.js";
import { indexRoutes } from "./routes/index.js";
import { providerRoutes } from "./routes/providers.js";
import { specRoutes } from "./routes/specs.js";
import { eventRoutes } from "./routes/events.js";
import { validatorRoutes } from "./routes/validators.js";
import { supplyRoutes } from "./routes/supply.js";
import { tvlRoutes } from "./routes/tvl.js";
import { aprRoutes } from "./routes/apr.js";
import { searchRoutes } from "./routes/search.js";
import { lavaRoutes } from "./routes/lava.js";
import { allProvidersAprRoutes } from "./routes/all-providers-apr.js";

const PORT = parseInt(process.env.API_PORT ?? "8080", 10);
const HOST = process.env.API_HOST ?? "0.0.0.0";

async function main() {
  const app = Fastify({
    logger: {
      transport:
        process.env.NODE_ENV === "development"
          ? { target: "pino-pretty" }
          : undefined,
    },
  });

  await app.register(cors, { origin: true, methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"] });
  await app.register(errorHandlerPlugin);
  await app.register(redisPlugin);
  await app.register(cachePlugin);
  await app.register(paginationPlugin);
  await app.register(csvPlugin);

  await app.register(healthRoutes);
  await app.register(indexRoutes, { prefix: "/index" });
  await app.register(providerRoutes, { prefix: "/providers" });
  await app.register(specRoutes, { prefix: "/specs" });
  await app.register(eventRoutes, { prefix: "/events" });
  await app.register(validatorRoutes, { prefix: "/validators" });
  await app.register(supplyRoutes, { prefix: "/supply" });
  await app.register(tvlRoutes);
  await app.register(aprRoutes);
  await app.register(allProvidersAprRoutes, { prefix: "/all_providers_apr" });
  await app.register(searchRoutes);
  await app.register(lavaRoutes, { prefix: "/lava" });

  await app.register(healthProbePlugin);

  await app.listen({ port: PORT, host: HOST });
  app.log.info(`API server listening on ${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error("Failed to start API server:", err);
  process.exit(1);
});
