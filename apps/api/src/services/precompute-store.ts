import type { Redis } from "ioredis";

/**
 * Stale-while-revalidate store for heavy endpoints.
 *
 * A separate worker process (see bin/precompute.ts) periodically runs the
 * expensive computations and writes results here. API route handlers read
 * from here first — on a hit they skip the cold-path compute entirely,
 * which means no cache stampede when TTLs expire under load.
 *
 * Values never expire in Redis; the worker overwrites them on each cycle.
 * If the worker is down, routes fall back to live compute.
 */

const KEY_PREFIX = "precompute:";

export interface PrecomputedValue<T> {
  /** Unix millis when the worker last wrote this value. */
  at: number;
  value: T;
}

export async function readPrecomputed<T>(redis: Redis | null, name: string): Promise<PrecomputedValue<T> | null> {
  if (!redis) return null;
  try {
    const raw = await redis.get(`${KEY_PREFIX}${name}`);
    if (!raw) return null;
    return JSON.parse(raw) as PrecomputedValue<T>;
  } catch {
    return null;
  }
}

export async function writePrecomputed<T>(redis: Redis, name: string, value: T): Promise<void> {
  const payload: PrecomputedValue<T> = { at: Date.now(), value };
  await redis.set(`${KEY_PREFIX}${name}`, JSON.stringify(payload));
}
