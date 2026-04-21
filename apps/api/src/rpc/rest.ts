import pino from "pino";
import { Agent } from "undici";
import { config } from "../config.js";

export const logger = pino({ name: "rpc" });

// One-shot dispatcher used only for retry attempts after a pruned-replica
// error. The default global dispatcher pools 32 sockets per origin for 30s,
// which means every retry inside that window reuses the SAME TCP connection
// and lands on the same backend (the one that doesn't have the block). A
// dispatcher with `keepAliveTimeout: 0` and `pipelining: 0` opens — and
// closes — one connection per request, giving Cloudflare a fresh routing
// decision and a chance at a healthy archive replica.
const noKeepAliveDispatcher = new Agent({
  connections: 1,
  pipelining: 0,
  keepAliveTimeout: 1,
  keepAliveMaxTimeout: 1,
});

/**
 * Concurrent in-flight RPC calls per batch loop. Operators running dedicated
 * RPC endpoints can raise this (env: RPC_BATCH_SIZE). Public endpoints should
 * keep a conservative value (~5) to avoid rate limiting.
 */
export const RPC_BATCH_SIZE = config.lava.rpcBatchSize;

// Request coalescing: concurrent fetches for the same path share one in-flight request
const inflightRpc = new Map<string, Promise<unknown>>();

// Archive-routing threshold. Recent blocks live on every replica; older blocks
// risk hitting a non-archive replica that has pruned the state and responds
// with `{success:false, "version does not exist"}`. Empirically the public LB
// starts losing blocks well within a week, so keep a tight 7-day window —
// archive nodes are heavier so we still want to avoid them for fresh queries.
// Lava produces ~1 block per 30s → 7 days ≈ 20_160 blocks.
const ARCHIVE_THRESHOLD_BLOCKS = 20_160;
const LATEST_HEIGHT_CACHE_MS = 60_000;
let latestHeightCache: { height: number; at: number } | null = null;

async function getLatestHeight(): Promise<number> {
  if (latestHeightCache && Date.now() - latestHeightCache.at < LATEST_HEIGHT_CACHE_MS) {
    return latestHeightCache.height;
  }
  // No blockHeight → won't trigger the archive-routing logic, no recursion.
  const data = await fetchRest<{ block: { header: { height: string } } }>(
    "/cosmos/base/tendermint/v1beta1/blocks/latest",
  );
  const height = parseInt(data.block.header.height, 10);
  latestHeightCache = { height, at: Date.now() };
  return height;
}

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
//   • Chain LB body-level error (200 OK with `{success:false, message:"upstream_error: ..."}`)
//     The lava REST gateway fronts multiple archive nodes; some have older
//     blocks pruned and respond with this wrapper instead of the expected
//     payload. Retries on a fresh connection (Connection: close + jittered
//     backoff) usually land on a healthy replica.
// 4xx client errors (including 404) are NOT retried — wrong path/params,
// retrying won't help.
const RPC_MAX_ATTEMPTS = 10;
const RPC_MAX_BACKOFF_MS = 5_000;
const RPC_REQUEST_TIMEOUT_MS = 20_000;

function shouldRetry(statusOrNull: number | null): boolean {
  if (statusOrNull === null) return true; // network-level error
  if (statusOrNull === 408 || statusOrNull === 429) return true;
  if (statusOrNull >= 500 && statusOrNull < 600) return true;
  return false;
}

/**
 * Lava REST returns a 200 OK with `{success:false, message:"upstream_error: ..."}`
 * for two very different conditions:
 *   1. The replica doesn't have the requested block in archive (pruned). Retry
 *      on a fresh connection — another replica may have it.
 *   2. The chain genuinely has no data for the request (provider not found,
 *      empty rewards collection, etc). Don't retry — return the body so
 *      downstream processors handle it as "no data".
 *
 * Returns "retry" for archive misses, "passthrough" for legitimate empty
 * answers, or null if the body isn't an error wrapper at all.
 */
function classifyChainUpstreamError(body: unknown): "retry" | "passthrough" | null {
  if (
    typeof body !== "object" ||
    body === null ||
    (body as { success?: unknown }).success !== false
  ) {
    return null;
  }
  const msg = ((body as { message?: unknown }).message as string | undefined) ?? "";
  // Archive pruning markers — replica doesn't have this block.
  if (msg.includes("version does not exist") || msg.includes("version mismatch")) {
    return "retry";
  }
  // Anything else is treated as a legitimate "no data" — passthrough so the
  // caller sees an empty payload rather than a 5xx after wasted retries.
  return "passthrough";
}

function backoffWithJitter(attempt: number): number {
  const base = Math.min(RPC_MAX_BACKOFF_MS, 2 ** attempt * 300);
  return base + Math.floor(Math.random() * 500);
}

async function fetchWithRetry<T>(url: string, baseHeaders: Record<string, string>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= RPC_MAX_ATTEMPTS; attempt++) {
    // After the first attempt force a brand-new TCP connection via a no-pool
    // dispatcher. The default global pool keeps sockets alive for ~30s; reusing
    // any of them means landing on the same backend that just rejected us.
    const fetchOpts: RequestInit = {
      headers: attempt === 1 ? baseHeaders : { ...baseHeaders, Connection: "close" },
      signal: AbortSignal.timeout(RPC_REQUEST_TIMEOUT_MS),
    };
    if (attempt > 1) (fetchOpts as { dispatcher?: unknown }).dispatcher = noKeepAliveDispatcher;
    try {
      const res = await fetch(url, fetchOpts);
      if (res.ok) {
        const body = (await res.json()) as unknown;
        const cls = classifyChainUpstreamError(body);
        if (cls === "retry") {
          const message = (body as { message?: string }).message;
          if (attempt === RPC_MAX_ATTEMPTS) {
            throw new Error(
              `chain upstream error after ${RPC_MAX_ATTEMPTS} attempts: ${message ?? "(no message)"}`,
            );
          }
          const backoffMs = backoffWithJitter(attempt);
          logger.warn(
            { url, attempt, backoffMs, message },
            "chain upstream returned success=false (pruned replica), retrying on fresh connection",
          );
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
        // cls === "passthrough" → legitimate empty answer; cls === null → normal payload.
        return body as T;
      }
      if (!shouldRetry(res.status)) {
        throw new Error(`RPC ${res.status}: ${res.statusText}`);
      }

      if (attempt === RPC_MAX_ATTEMPTS) {
        throw new Error(`RPC ${res.status}: ${res.statusText}`);
      }

      const retryAfter = parseInt(res.headers.get("retry-after") ?? "0", 10);
      const backoffMs = retryAfter > 0
        ? Math.min(RPC_MAX_BACKOFF_MS, retryAfter * 1000)
        : backoffWithJitter(attempt);
      logger.warn({ url, status: res.status, attempt, backoffMs }, "chain RPC retryable error, backing off");
      await new Promise((r) => setTimeout(r, backoffMs));
    } catch (e) {
      lastErr = e;
      if (attempt === RPC_MAX_ATTEMPTS) throw e;
      const backoffMs = backoffWithJitter(attempt);
      logger.warn({ url, attempt, err: String(e) }, "chain RPC error, retrying");
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
    if (blockHeight) {
      headers["x-cosmos-block-height"] = String(blockHeight);
      // Pin OLD historical queries to archive replicas. Without the header the
      // public LB freely routes to non-archive replicas that have pruned the
      // requested block and return `{success:false, "version does not exist"}`.
      // Recent blocks are still on every replica, and archive nodes are heavier
      // / under more load — so only opt in when the block is genuinely old.
      const latest = await getLatestHeight().catch(() => null);
      if (latest !== null && latest - blockHeight > ARCHIVE_THRESHOLD_BLOCKS) {
        headers["lava-extension"] = "archive";
      }
    }
    return await fetchWithRetry<T>(`${config.lava.restUrl}${path}`, headers);
  })();

  inflightRpc.set(cacheKey, promise);
  const cleanup = () => { inflightRpc.delete(cacheKey); };
  promise.then(cleanup, cleanup);
  return promise;
}
