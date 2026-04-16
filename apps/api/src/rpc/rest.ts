import pino from "pino";

export const logger = pino({ name: "rpc" });

export const LAVA_REST_URL = process.env.LAVA_REST_URL ?? "https://lava.rest.lava.build";

// Concurrent in-flight RPC calls per batch loop. Operators running dedicated
// RPC endpoints can raise this (env: RPC_BATCH_SIZE). Public endpoints should
// keep a conservative value (~5) to avoid rate limiting.
export const RPC_BATCH_SIZE = Math.max(1, parseInt(process.env.RPC_BATCH_SIZE ?? "25", 10));

// Request coalescing: concurrent fetches for the same path share one in-flight request
const inflightRpc = new Map<string, Promise<unknown>>();

export async function fetchRest<T>(path: string, blockHeight?: number): Promise<T> {
  const cacheKey = blockHeight ? `${path}@${blockHeight}` : path;
  const existing = inflightRpc.get(cacheKey);
  if (existing) return existing as Promise<T>;

  const promise = (async () => {
    const headers: Record<string, string> = {};
    if (blockHeight) headers["x-cosmos-block-height"] = String(blockHeight);

    const res = await fetch(`${LAVA_REST_URL}${path}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`RPC ${res.status}: ${res.statusText}`);
    return (await res.json()) as T;
  })();

  inflightRpc.set(cacheKey, promise);
  const cleanup = () => { inflightRpc.delete(cacheKey); };
  promise.then(cleanup, cleanup);
  return promise;
}
