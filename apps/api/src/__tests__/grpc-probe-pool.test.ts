import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLIENT_POOL_LIMIT,
  __clientPoolSize,
  __resetClientPool,
  getClient,
} from "../services/grpc-probe.js";

/**
 * Regression test for the gRPC clientPool memory leak: the pool created one
 * client per endpoint and never closed/evicted any, so churning provider
 * endpoints accumulated dead HTTP/2 channels until the task OOM-killed.
 *
 * These tests exercise the eviction + close logic through the injectable
 * createClient factory — no real network/gRPC channel is opened.
 */

interface FakeClient {
  endpoint: string;
  close: ReturnType<typeof vi.fn>;
}

function makeFactory() {
  const created: FakeClient[] = [];
  const create = (endpoint: string) => {
    const client = { endpoint, close: vi.fn() };
    created.push(client);
    // The cast matches the real grpc ServiceClient instance shape closely
    // enough for the pool, which only ever calls .close() on it here.
    return client as unknown as InstanceType<
      typeof import("@grpc/grpc-js").ServiceClientConstructor
    >;
  };
  return { created, create };
}

afterEach(() => {
  __resetClientPool();
});

describe("grpc-probe clientPool", () => {
  it("reuses the same client for a repeated endpoint (no new channel)", () => {
    const { created, create } = makeFactory();

    const a = getClient("provider-1.lava.build:443", create);
    const b = getClient("provider-1.lava.build:443", create);

    expect(a).toBe(b);
    expect(created).toHaveLength(1);
    expect(__clientPoolSize()).toBe(1);
  });

  it("creates distinct clients for distinct endpoints", () => {
    const { created, create } = makeFactory();

    getClient("provider-1.lava.build:443", create);
    getClient("provider-2.lava.build:443", create);

    expect(created).toHaveLength(2);
    expect(__clientPoolSize()).toBe(2);
  });

  it("is bounded — never exceeds CLIENT_POOL_LIMIT entries", () => {
    const { create } = makeFactory();

    // Push well past the cap with unique endpoints (the leak scenario).
    for (let i = 0; i < CLIENT_POOL_LIMIT + 50; i++) {
      getClient(`provider-${i}.lava.build:443`, create);
    }

    expect(__clientPoolSize()).toBe(CLIENT_POOL_LIMIT);
  });

  it("closes the channel of every evicted client", () => {
    const { created, create } = makeFactory();

    const overflow = 50;
    for (let i = 0; i < CLIENT_POOL_LIMIT + overflow; i++) {
      getClient(`provider-${i}.lava.build:443`, create);
    }

    // The first `overflow` endpoints are the least-recently-used and must have
    // been evicted AND closed.
    const closed = created.filter((c) => c.close.mock.calls.length > 0);
    expect(closed).toHaveLength(overflow);
    for (let i = 0; i < overflow; i++) {
      expect(created[i]!.close).toHaveBeenCalledTimes(1);
    }
  });

  it("keeps recently-used endpoints warm (LRU touch survives eviction)", () => {
    const { create } = makeFactory();

    // Fill the pool exactly to the cap.
    for (let i = 0; i < CLIENT_POOL_LIMIT; i++) {
      getClient(`provider-${i}.lava.build:443`, create);
    }

    // Touch endpoint 0 so it becomes most-recently-used.
    const warm = getClient("provider-0.lava.build:443", create);

    // One more unique endpoint forces a single eviction — it must NOT be
    // endpoint 0 (which we just touched); endpoint 1 is now the LRU.
    getClient("provider-new.lava.build:443", create);

    // Endpoint 0 still resolves to the same live client (no re-create).
    const stillWarm = getClient("provider-0.lava.build:443", create);
    expect(stillWarm).toBe(warm);
    expect(__clientPoolSize()).toBe(CLIENT_POOL_LIMIT);
  });

  it("__resetClientPool closes all channels and empties the pool", () => {
    const { created, create } = makeFactory();

    getClient("provider-1.lava.build:443", create);
    getClient("provider-2.lava.build:443", create);
    expect(__clientPoolSize()).toBe(2);

    __resetClientPool();

    expect(__clientPoolSize()).toBe(0);
    for (const c of created) {
      expect(c.close).toHaveBeenCalledTimes(1);
    }
  });
});
