import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getConfig } from "./config.js";
import pino from "pino";

const execFileAsync = promisify(execFile);
const logger = pino({ name: "health-check" });

const TIMEOUT_MS = 120_000;

/**
 * Run `lavap test health` for a single provider.
 * The results are posted by lavap to the local result-server HTTP endpoint.
 * Replaces Python's subprocess.run(['lavap', 'test', 'health', ...])
 */
export async function runHealthCheck(
  providerAddress: string,
  specsInterfacesData?: string,
): Promise<void> {
  const config = getConfig();

  const args = [
    "test", "health",
    config.HEALTH_CONFIG_PATH,
    "--node", config.NODE_URL,
    "--single-provider-address", providerAddress,
    "--run-once-and-exit",
    "--post-results-skip-spec",
  ];

  if (specsInterfacesData) {
    args.push("--single-provider-specs-interfaces-data", specsInterfacesData);
  }

  try {
    await execFileAsync(config.LAVAP_PATH, args, {
      timeout: TIMEOUT_MS,
      cwd: process.cwd(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ provider: providerAddress, err: message }, "Health check failed");
  }
}
