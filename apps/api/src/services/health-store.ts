import type { Redis } from "ioredis";

export interface HealthRecord {
  id: string;
  provider: string;
  spec: string;
  interface: string;
  geolocation: string;
  status: string;
  timestamp: string;
  data: Record<string, unknown>;
}

const HEALTH_TTL = 600; // 10 minutes

function healthKey(provider: string, spec: string, apiInterface: string, geolocation: string): string {
  return `health:${provider}-${spec}-${apiInterface}-${geolocation}`;
}

function providerIndexKey(provider: string): string {
  return `health:idx:provider:${provider}`;
}

function specIndexKey(spec: string): string {
  return `health:idx:spec:${spec}`;
}

export async function writeHealthStatus(
  redis: Redis,
  provider: string,
  spec: string,
  apiInterface: string,
  geolocation: string,
  status: string,
  data: Record<string, unknown>,
): Promise<void> {
  const key = healthKey(provider, spec, apiInterface, geolocation);
  const record: HealthRecord = {
    id: `${provider}-${spec}-${apiInterface}-${geolocation}`,
    provider,
    spec,
    interface: apiInterface,
    geolocation,
    status,
    timestamp: new Date().toISOString(),
    data,
  };

  const pipeline = redis.pipeline();
  pipeline.set(key, JSON.stringify(record), "EX", HEALTH_TTL);
  pipeline.sadd(providerIndexKey(provider), key);
  pipeline.sadd(specIndexKey(spec), key);
  await pipeline.exec();
}

async function readFromIndex(
  redis: Redis,
  indexKey: string,
): Promise<HealthRecord[]> {
  const keys = await redis.smembers(indexKey);
  if (keys.length === 0) return [];

  const values = await redis.mget(...keys);
  const records: HealthRecord[] = [];
  const staleKeys: string[] = [];

  for (let i = 0; i < keys.length; i++) {
    const val = values[i];
    if (val) {
      records.push(JSON.parse(val) as HealthRecord);
    } else {
      staleKeys.push(keys[i]);
    }
  }

  // Clean up stale index entries
  if (staleKeys.length > 0) {
    await redis.srem(indexKey, ...staleKeys);
  }

  return records;
}

export async function readHealthForProvider(
  redis: Redis,
  provider: string,
  page: number,
  limit: number,
): Promise<{ data: HealthRecord[]; total: number }> {
  const records = await readFromIndex(redis, providerIndexKey(provider));
  records.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const total = records.length;
  const offset = (page - 1) * limit;
  return { data: records.slice(offset, offset + limit), total };
}

export interface InterfaceHealth {
  name: string;
  status: string;
  latencyMs: number | null;
  block: number | null;
  message: string | null;
  timestamp: string;
}

export interface SpecHealth {
  status: "healthy" | "unhealthy";
  total: number;
  unhealthy: number;
  oldestTimestamp: string;
  interfaces: InterfaceHealth[];
}

export async function readHealthMapForProvider(
  redis: Redis,
  provider: string,
): Promise<Map<string, SpecHealth>> {
  const records = await readFromIndex(redis, providerIndexKey(provider));
  const bySpec = new Map<string, HealthRecord[]>();

  for (const r of records) {
    const existing = bySpec.get(r.spec) ?? [];
    existing.push(r);
    bySpec.set(r.spec, existing);
  }

  const result = new Map<string, SpecHealth>();
  for (const [spec, recs] of bySpec) {
    const interfaces: InterfaceHealth[] = recs.map((r) => ({
      name: r.interface,
      status: r.status,
      latencyMs: r.status === "healthy" ? (r.data.latency as number) ?? null : null,
      block: r.status === "healthy" ? (r.data.block as number) ?? null : null,
      message: r.status !== "healthy" ? (r.data.message as string) ?? null : null,
      timestamp: r.timestamp,
    }));

    const unhealthyCount = interfaces.filter((i) => i.status !== "healthy").length;
    const oldestTimestamp = recs.reduce(
      (oldest, r) => (r.timestamp < oldest ? r.timestamp : oldest),
      recs[0].timestamp,
    );

    result.set(spec, {
      status: unhealthyCount > 0 ? "unhealthy" : "healthy",
      total: interfaces.length,
      unhealthy: unhealthyCount,
      oldestTimestamp,
      interfaces,
    });
  }

  return result;
}

export async function readHealthSummaryForSpec(
  redis: Redis,
  spec: string,
): Promise<Array<{ status: string; count: number }>> {
  const records = await readFromIndex(redis, specIndexKey(spec));

  const counts = new Map<string, number>();
  for (const r of records) {
    counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  }

  return Array.from(counts.entries()).map(([status, count]) => ({ status, count }));
}
