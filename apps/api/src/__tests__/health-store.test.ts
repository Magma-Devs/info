import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ioredis before importing health-store
vi.mock("ioredis", () => ({ default: vi.fn() }));

const {
  writeHealthStatus,
  readHealthForProvider,
  readHealthSummaryForSpec,
  readHealthMapForProvider,
  readHealthByProviderForSpec,
} = await import("../services/health-store.js");

function createMockRedis() {
  const store = new Map<string, string>();
  const sets = new Map<string, Set<string>>();

  return {
    pipeline: () => {
      const ops: (() => void)[] = [];
      return {
        set: (key: string, val: string, _ex: string, _ttl: number) => {
          ops.push(() => store.set(key, val));
        },
        sadd: (key: string, member: string) => {
          ops.push(() => {
            const s = sets.get(key) ?? new Set();
            s.add(member);
            sets.set(key, s);
          });
        },
        exec: async () => { ops.forEach((op) => op()); },
      };
    },
    smembers: async (key: string) => [...(sets.get(key) ?? [])],
    mget: async (...keys: string[]) => keys.map((k) => store.get(k) ?? null),
    srem: async (key: string, ...members: string[]) => {
      const s = sets.get(key);
      if (s) members.forEach((m) => s.delete(m));
    },
    // expose internals for assertions
    _store: store,
    _sets: sets,
  };
}

describe("health-store", () => {
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    redis = createMockRedis();
  });

  describe("writeHealthStatus", () => {
    it("writes a health record to Redis with index sets", async () => {
      await writeHealthStatus(redis as any, "lava@test", "ETH1", "jsonrpc", "2", "healthy", { latency: 42 });

      expect(redis._store.size).toBe(1);
      const key = "health:lava@test-ETH1-jsonrpc-2";
      const record = JSON.parse(redis._store.get(key)!);
      expect(record.provider).toBe("lava@test");
      expect(record.spec).toBe("ETH1");
      expect(record.status).toBe("healthy");
      expect(record.data.latency).toBe(42);

      // Check index sets
      expect(redis._sets.get("health:idx:provider:lava@test")?.has(key)).toBe(true);
      expect(redis._sets.get("health:idx:spec:ETH1")?.has(key)).toBe(true);
    });
  });

  describe("readHealthForProvider", () => {
    it("returns empty for unknown provider", async () => {
      const result = await readHealthForProvider(redis as any, "lava@unknown", 1, 20);
      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("returns all health records for a provider", async () => {
      await writeHealthStatus(redis as any, "lava@test", "ETH1", "jsonrpc", "2", "healthy", { latency: 10 });
      await writeHealthStatus(redis as any, "lava@test", "LAVA", "grpc", "1", "unhealthy", { message: "timeout" });

      const result = await readHealthForProvider(redis as any, "lava@test", 1, 20);
      expect(result.total).toBe(2);
      expect(result.data).toHaveLength(2);
      const specs = result.data.map((r) => r.spec).sort();
      expect(specs).toEqual(["ETH1", "LAVA"]);
    });

    it("paginates correctly", async () => {
      await writeHealthStatus(redis as any, "lava@test", "ETH1", "jsonrpc", "2", "healthy", {});
      await writeHealthStatus(redis as any, "lava@test", "LAVA", "grpc", "1", "healthy", {});
      await writeHealthStatus(redis as any, "lava@test", "BSC", "jsonrpc", "2", "healthy", {});

      const page1 = await readHealthForProvider(redis as any, "lava@test", 1, 2);
      expect(page1.data).toHaveLength(2);
      expect(page1.total).toBe(3);

      const page2 = await readHealthForProvider(redis as any, "lava@test", 2, 2);
      expect(page2.data).toHaveLength(1);
    });
  });

  describe("readHealthSummaryForSpec", () => {
    it("returns status counts for a spec", async () => {
      await writeHealthStatus(redis as any, "lava@a", "ETH1", "jsonrpc", "2", "healthy", {});
      await writeHealthStatus(redis as any, "lava@b", "ETH1", "jsonrpc", "2", "healthy", {});
      await writeHealthStatus(redis as any, "lava@c", "ETH1", "jsonrpc", "2", "unhealthy", { message: "down" });

      const summary = await readHealthSummaryForSpec(redis as any, "ETH1");
      const healthy = summary.find((s) => s.status === "healthy");
      const unhealthy = summary.find((s) => s.status === "unhealthy");
      expect(healthy?.count).toBe(2);
      expect(unhealthy?.count).toBe(1);
    });

    it("returns empty for unknown spec", async () => {
      const summary = await readHealthSummaryForSpec(redis as any, "UNKNOWN");
      expect(summary).toEqual([]);
    });
  });

  describe("readHealthMapForProvider", () => {
    it("groups health records by spec", async () => {
      await writeHealthStatus(redis as any, "lava@test", "ETH1", "jsonrpc", "2", "healthy", { latency: 42, block: 100 });
      await writeHealthStatus(redis as any, "lava@test", "ETH1", "rest", "2", "unhealthy", { message: "timeout" });
      await writeHealthStatus(redis as any, "lava@test", "LAVA", "grpc", "1", "healthy", { latency: 10, block: 50 });

      const map = await readHealthMapForProvider(redis as any, "lava@test");
      expect(map.size).toBe(2);

      const eth1 = map.get("ETH1")!;
      expect(eth1.status).toBe("unhealthy"); // one interface down
      expect(eth1.total).toBe(2);
      expect(eth1.unhealthy).toBe(1);
      expect(eth1.interfaces).toHaveLength(2);

      const lava = map.get("LAVA")!;
      expect(lava.status).toBe("healthy");
      expect(lava.total).toBe(1);
    });
  });

  describe("readHealthByProviderForSpec", () => {
    it("groups health records by provider for a spec", async () => {
      await writeHealthStatus(redis as any, "lava@a", "ETH1", "jsonrpc", "2", "healthy", { latency: 30 });
      await writeHealthStatus(redis as any, "lava@b", "ETH1", "jsonrpc", "2", "unhealthy", { message: "err" });
      await writeHealthStatus(redis as any, "lava@a", "LAVA", "grpc", "1", "healthy", {}); // different spec

      const map = await readHealthByProviderForSpec(redis as any, "ETH1");
      expect(map.size).toBe(2);
      expect(map.get("lava@a")?.status).toBe("healthy");
      expect(map.get("lava@b")?.status).toBe("unhealthy");
    });
  });
});
