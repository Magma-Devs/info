import pino from "pino";
import { config } from "../config.js";

export const logger = pino({ name: "rpc" });

/**
 * Concurrent in-flight RPC calls per batch loop. Operators running dedicated
 * RPC endpoints can raise this (env: RPC_BATCH_SIZE). Public endpoints should
 * keep a conservative value (~5) to avoid rate limiting.
 */
export const RPC_BATCH_SIZE = config.lava.rpcBatchSize;

// Request coalescing: concurrent fetches for the same path share one in-flight request
const inflightRpc = new Map<string, Promise<unknown>>();

// ── Retry policy ─────────────────────────────────────────────────────────────
// Transient failures on the public chain RPC (network blips, rate limits on
// concurrent historical queries, archive-node slow paths) previously returned
// errors that upstream callers silently swallowed via `.catch(() => [])`,
// dropping providers from historical rewards responses. Retry with exponential
// backoff so transient blips don't leak into user-visible output.
//
// Retry on "likely transient" failures:
//   • Network error (fetch rejected — timeout, connection reset, DNS, etc.)
//   • 408 Request Timeout
//   • 429 Too Many Requests (honor Retry-After if present)
//   • 5xx Server Error
// 4xx client errors (including 404) are NOT retried — wrong path/params,
// retrying won't help.
const RPC_MAX_ATTEMPTS = 3;
const RPC_MAX_BACKOFF_MS = 8_000;
const RPC_REQUEST_TIMEOUT_MS = 20_000;

function shouldRetry(statusOrNull: number | null): boolean {
  if (statusOrNull === null) return true; // network-level error
  if (statusOrNull === 408 || statusOrNull === 429) return true;
  if (statusOrNull >= 500 && statusOrNull < 600) return true;
  return false;
}

async function fetchWithRetry(url: string, headers: Record<string, string>): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= RPC_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(RPC_REQUEST_TIMEOUT_MS),
      });
      if (res.ok) return res;
      if (!shouldRetry(res.status)) return res; // 4xx — let caller throw

      if (attempt === RPC_MAX_ATTEMPTS) return res; // exhausted — return last

      const retryAfter = parseInt(res.headers.get("retry-after") ?? "0", 10);
      const backoffMs = Math.min(
        RPC_MAX_BACKOFF_MS,
        retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 500,
      );
      logger.warn({ url, status: res.status, attempt, backoffMs }, "chain RPC retryable error, backing off");
      await new Promise((r) => setTimeout(r, backoffMs));
    } catch (e) {
      lastErr = e;
      if (attempt === RPC_MAX_ATTEMPTS) throw e;
      const backoffMs = Math.min(RPC_MAX_BACKOFF_MS, 2 ** attempt * 500);
      logger.warn({ url, attempt, err: String(e) }, "chain RPC network error, retrying");
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastErr ?? new Error("fetchWithRetry: unreachable");
}

export async function fetchRest<T>(path: string, blockHeight?: number): Promise<T> {
  const cacheKey = blockHeight ? `${path}@${blockHeight}` : path;
  const existing = inflightRpc.get(cacheKey);
  if (existing) return existing as Promise<T>;

  const promise = (async () => {
    const headers: Record<string, string> = {};
    if (blockHeight) headers["x-cosmos-block-height"] = String(blockHeight);

    const res = await fetchWithRetry(`${config.lava.restUrl}${path}`, headers);
    if (!res.ok) throw new Error(`RPC ${res.status}: ${res.statusText}`);
    return (await res.json()) as T;
  })();

  inflightRpc.set(cacheKey, promise);
  const cleanup = () => { inflightRpc.delete(cacheKey); };
  promise.then(cleanup, cleanup);
  return promise;
}
