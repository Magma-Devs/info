import Fastify from "fastify";
import { getConfig } from "./config.js";
import { normalizeBlock } from "@info/shared/constants";
import { writeHealthStatus } from "./db.js";
import pino from "pino";

const logger = pino({ name: "result-server" });

interface HealthPostBody {
  providerData?: Record<string, { block: number; latency: number }>;
  unhealthyProviders?: Record<string, string>;
  frozenProviders?: Record<string, string>;
}

export async function startResultServer(): Promise<void> {
  const config = getConfig();
  const geolocation = config.REGION;

  const app = Fastify({ logger: false });

  app.get("/healthz", async () => ({ status: "ok" }));

  app.post("/", async (request) => {
    const body = request.body as HealthPostBody;
    if (!body) return { status: "ok" };

    const promises: Promise<void>[] = [];

    if (body.providerData) {
      for (const [key, value] of Object.entries(body.providerData)) {
        const parts = key.split(" | ");
        if (parts.length !== 3) continue;
        const [provider, spec, apiInterface] = parts;
        const block = normalizeBlock(spec, value.block ?? 0);
        promises.push(writeHealthStatus(provider, spec, apiInterface, geolocation, "healthy", { block, latency: value.latency ?? 0 }));
      }
    }

    if (body.unhealthyProviders) {
      for (const [key, message] of Object.entries(body.unhealthyProviders)) {
        const parts = key.split(" | ");
        if (parts.length !== 3) continue;
        const [provider, spec, apiInterface] = parts;
        promises.push(writeHealthStatus(provider, spec, apiInterface, geolocation, "unhealthy", { message }));
      }
    }

    if (body.frozenProviders) {
      for (const [key, message] of Object.entries(body.frozenProviders)) {
        const parts = key.split(" | ");
        if (parts.length !== 3) continue;
        const [provider, spec, apiInterface] = parts;
        promises.push(writeHealthStatus(provider, spec, apiInterface, geolocation, "frozen", { message }));
      }
    }

    await Promise.allSettled(promises);
    return { status: "ok" };
  });

  await app.listen({ port: config.HEALTH_PROBE_HTTP_PORT, host: config.HEALTH_PROBE_HTTP_HOST });
  logger.info({ port: config.HEALTH_PROBE_HTTP_PORT }, "Result server started");
}
