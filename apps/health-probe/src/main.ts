import { getConfig } from "./config.js";
import { fetchProviders } from "./providers.js";
import { getAccountInfo } from "./account-info.js";
import { runHealthCheck } from "./health-check.js";
import { writeHealthStatus, closePool } from "./db.js";
import { startResultServer } from "./result-server.js";
import pino from "pino";

const logger = pino({ name: "health-probe" });

const MAX_INT64 = "9223372036854775807";

function parseAccountInfo(
  data: Record<string, unknown>,
): Array<{ spec: string; interfaces: string[]; status: string; jailEndTime?: string }> {
  const results: Array<{ spec: string; interfaces: string[]; status: string; jailEndTime?: string }> = [];

  const addEntries = (entries: unknown[], status: string) => {
    if (!Array.isArray(entries)) return;
    for (const entry of entries) {
      const e = entry as Record<string, unknown>;
      const chains = (e.chains ?? []) as Array<Record<string, unknown>>;
      for (const chain of chains) {
        const endpoints = (chain.endpoints ?? []) as Array<Record<string, unknown>>;
        const interfaces = endpoints.flatMap((ep) => (ep.api_interfaces ?? []) as string[]);
        results.push({
          spec: String(chain.chainID ?? ""),
          interfaces: [...new Set(interfaces)],
          status,
          jailEndTime: e.jail_end_time ? String(e.jail_end_time) : undefined,
        });
      }
    }
  };

  addEntries(data.provider as unknown[], "healthy");
  addEntries(data.frozen as unknown[], "frozen");
  addEntries(data.unstaked as unknown[], "unstaked");

  for (const r of results) {
    if (r.status === "frozen" && r.jailEndTime) {
      r.status = r.jailEndTime === MAX_INT64 ? "frozen" : "jailed";
    }
  }

  return results;
}

async function processProvider(address: string): Promise<void> {
  const config = getConfig();
  const geolocation = config.REGION;

  const accountInfo = await getAccountInfo(address);
  if (!accountInfo) return;

  const parsed = parseAccountInfo(accountInfo as unknown as Record<string, unknown>);
  if (parsed.length === 0) return;

  const healthySpecs = parsed.filter((p) => p.status === "healthy");
  if (healthySpecs.length > 0) {
    const specsData = healthySpecs.map((s) => ({ spec: s.spec, interfaces: s.interfaces }));
    await runHealthCheck(address, JSON.stringify(specsData));
  }

  // Write frozen/jailed/unstaked directly to DB
  const writes: Promise<void>[] = [];
  for (const p of parsed) {
    if (p.status === "healthy") continue;
    for (const iface of p.interfaces) {
      writes.push(writeHealthStatus(address, p.spec, iface, geolocation, p.status, {}));
    }
  }
  await Promise.allSettled(writes);
}

async function main(): Promise<void> {
  logger.info("Health probe starting");

  await startResultServer();

  let running = true;
  const shutdown = async () => {
    logger.info("Shutting down");
    running = false;
    await closePool();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());

  while (running) {
    try {
      const providers = await fetchProviders();
      if (providers.length === 0) {
        logger.warn("No providers found, waiting");
        await new Promise((r) => setTimeout(r, 60_000));
        continue;
      }

      const shuffled = [...providers].sort(() => Math.random() - 0.5);

      for (const provider of shuffled) {
        if (!running) break;
        try {
          await processProvider(provider.address);
        } catch (err) {
          logger.error({ provider: provider.address, err }, "Error processing provider");
        }
      }

      if (running) await new Promise((r) => setTimeout(r, 30_000));
    } catch (err) {
      logger.error({ err }, "Main loop error");
      await new Promise((r) => setTimeout(r, 60_000));
    }
  }
}

main().catch(async (err) => {
  logger.fatal({ err }, "Health probe crashed");
  await closePool();
  process.exit(1);
});
