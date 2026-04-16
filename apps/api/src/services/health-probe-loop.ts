import type { Redis } from "ioredis";
import pino from "pino";
import { normalizeBlock } from "@info/shared/constants";
import { config } from "../config.js";
import { fetchAllSpecs, fetchProvidersForSpec, RPC_BATCH_SIZE } from "../rpc/lava.js";
import type { ProviderEndpoint } from "../rpc/lava.js";
import { probeProvider } from "./grpc-probe.js";
import { writeHealthStatus } from "./health-store.js";

const logger = pino({ name: "health-probe" });

interface ProbeTarget {
  address: string;
  specId: string;
  endpoint: ProviderEndpoint;
  apiInterface: string;
}

async function buildProbeTargets(): Promise<ProbeTarget[]> {
  const specs = await fetchAllSpecs();
  const targets: ProbeTarget[] = [];

  // Fetch in batches — raise RPC_BATCH_SIZE via env for dedicated RPC endpoints.
  for (let i = 0; i < specs.length; i += RPC_BATCH_SIZE) {
    const batch = specs.slice(i, i + RPC_BATCH_SIZE);
    const results = await Promise.all(
      batch.map((s) =>
        fetchProvidersForSpec(s.index)
          .then((providers) => ({ specId: s.index, providers }))
          .catch(() => ({ specId: s.index, providers: [] as Awaited<ReturnType<typeof fetchProvidersForSpec>> })),
      ),
    );

    for (const { specId, providers } of results) {
      for (const provider of providers) {
        for (const ep of provider.endpoints) {
          // Skip endpoints targeting private/internal networks
          if (!isPublicEndpoint(ep.iPPORT)) continue;

          for (const apiInterface of ep.apiInterfaces) {
            targets.push({
              address: provider.address,
              specId,
              endpoint: ep,
              apiInterface,
            });
          }
        }
      }
    }
  }

  return targets;
}

/** Reject endpoints targeting private/loopback/internal networks (SSRF mitigation) */
function isPublicEndpoint(iPPORT: string): boolean {
  const host = iPPORT.split(":")[0];
  if (!host) return false;
  if (host === "localhost" || host === "0.0.0.0") return false;
  if (host.startsWith("127.")) return false;
  if (host.startsWith("10.")) return false;
  if (host.startsWith("192.168.")) return false;
  if (host.startsWith("172.")) {
    const second = parseInt(host.split(".")[1] ?? "", 10);
    if (second >= 16 && second <= 31) return false;
  }
  if (host.startsWith("169.254.")) return false;
  return true;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface ProbeLoopOptions {
  redis: Redis;
  intervalMs?: number;
  /** Returns true while the loop should keep running — called between iterations. */
  isRunning: () => boolean;
}

/**
 * Run one provider-health probe cycle followed by sleep, repeatedly.
 *
 * This loop is the core of the health-probe subsystem. It's extracted so it
 * can be invoked from either an in-process Fastify plugin (dev / single-node)
 * or a standalone worker process (production) — see `bin/health-probe.ts`.
 */
export async function runProbeLoop(opts: ProbeLoopOptions): Promise<void> {
  const { redis, isRunning } = opts;
  const intervalMs = opts.intervalMs ?? config.healthProbe.intervalMs;

  logger.info("Health probe started");

  while (isRunning()) {
    try {
      const targets = await buildProbeTargets();
      if (targets.length === 0) {
        logger.warn("No probe targets found, waiting");
        await sleep(60_000);
        continue;
      }

      const shuffled = shuffle(targets);
      logger.info({ count: shuffled.length }, "Starting health probe cycle");

      // Probe in batches — raise RPC_BATCH_SIZE via env for dedicated endpoints.
      for (let i = 0; i < shuffled.length; i += RPC_BATCH_SIZE) {
        if (!isRunning()) break;
        const batch = shuffled.slice(i, i + RPC_BATCH_SIZE);

        await Promise.allSettled(batch.map(async (target) => {
          const geolocation = target.endpoint.geolocation.toString();
          try {
            const result = await probeProvider(
              target.endpoint.iPPORT,
              target.specId,
              target.apiInterface,
            );
            const block = normalizeBlock(target.specId, result.latestBlock);
            await writeHealthStatus(
              redis, target.address, target.specId, target.apiInterface, geolocation,
              "healthy",
              { block, latency: result.latencyMs, lavaEpoch: result.lavaEpoch },
            );
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            await writeHealthStatus(
              redis, target.address, target.specId, target.apiInterface, geolocation,
              "unhealthy",
              { message },
            );
          }
        }));
      }

      if (isRunning()) await sleep(intervalMs);
    } catch (err) {
      logger.error({ err }, "Health probe loop error");
      await sleep(60_000);
    }
  }

  logger.info("Health probe stopped");
}
