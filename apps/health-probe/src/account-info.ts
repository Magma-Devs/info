import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getConfig } from "./config.js";
import type { AccountInfoResult } from "@info/shared/types";
import pino from "pino";

const execFileAsync = promisify(execFile);
const logger = pino({ name: "account-info" });

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5_000;
const TIMEOUT_MS = 60_000;

const RETRYABLE_ERRORS = [
  "character 'e' looking for beginning of value",
  "Many Requests",
  "private key",
];

/**
 * Run `lavad q pairing account-info <address>` and parse the JSON output.
 * Replaces Python's subprocess.run(['lavad', ...])
 */
export async function getAccountInfo(address: string): Promise<AccountInfoResult | null> {
  const config = getConfig();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { stdout } = await execFileAsync(
        config.LAVAD_PATH,
        ["q", "pairing", "account-info", address, "--output", "json", "--node", config.NODE_URL],
        { timeout: TIMEOUT_MS },
      );

      return JSON.parse(stdout) as AccountInfoResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isRetryable = RETRYABLE_ERRORS.some((e) => message.includes(e));

      if (!isRetryable || attempt === MAX_RETRIES) {
        logger.warn({ address, attempt, err: message }, "account-info failed");
        return null;
      }

      const delay = RETRY_DELAY_MS * attempt;
      logger.debug({ address, attempt, delay }, "Retrying account-info");
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  return null;
}
