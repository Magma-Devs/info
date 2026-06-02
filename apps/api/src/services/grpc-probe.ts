import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PROTO_PATH = join(__dirname, "..", "proto", "relay.proto");
const PROBE_TIMEOUT_MS = 10_000;

const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: Number,
  enums: String,
  defaults: true,
});

const proto = grpc.loadPackageDefinition(packageDef) as unknown as {
  lavanet: {
    lava: {
      pairing: {
        Relayer: grpc.ServiceClientConstructor;
      };
    };
  };
};

const RelayerClient = proto.lavanet.lava.pairing.Relayer;

type RelayerClientInstance = InstanceType<grpc.ServiceClientConstructor>;

/**
 * Max number of gRPC clients kept warm at once. Each entry owns a live HTTP/2
 * channel (socket + keepalive timers + native buffers), so an unbounded pool
 * leaks memory and file descriptors as provider endpoints churn (restarts,
 * re-IPs, stake changes) over the process lifetime. We bound the pool and
 * close the least-recently-used channel on overflow.
 *
 * Override via HEALTH_PROBE_CLIENT_POOL_MAX. The provider universe in flight at
 * any moment is a few hundred endpoints; 256 keeps the active set warm while
 * capping retained channels.
 */
const CLIENT_POOL_MAX = (() => {
  const raw = process.env.HEALTH_PROBE_CLIENT_POOL_MAX;
  const n = raw !== undefined ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 256;
})();

// Reuse gRPC clients per endpoint — avoids TLS handshake per probe call.
// Map insertion order gives us LRU ordering: a hit re-inserts the key to the
// tail, so the least-recently-used entry is always Map's first key.
const clientPool = new Map<string, RelayerClientInstance>();

/**
 * Build a real SSL-backed Relayer client. Injectable so the pool's
 * eviction/closing behaviour can be unit-tested without network I/O.
 */
function defaultCreateClient(endpoint: string): RelayerClientInstance {
  return new RelayerClient(endpoint, grpc.credentials.createSsl());
}

function closeClient(client: RelayerClientInstance): void {
  try {
    // grpc-js clients expose close() to tear down the channel; guard in case a
    // test double or future client shape omits it.
    (client as { close?: () => void }).close?.();
  } catch {
    // A failed close must not crash the probe loop — the channel will be GC'd
    // once unreferenced regardless.
  }
}

export function getClient(
  endpoint: string,
  createClient: (endpoint: string) => RelayerClientInstance = defaultCreateClient,
): RelayerClientInstance {
  const existing = clientPool.get(endpoint);
  if (existing) {
    // LRU touch: move to tail so active endpoints survive eviction.
    clientPool.delete(endpoint);
    clientPool.set(endpoint, existing);
    return existing;
  }

  // Evict least-recently-used entries (and close their channels) until there's
  // room for the newcomer.
  while (clientPool.size >= CLIENT_POOL_MAX) {
    const lruKey = clientPool.keys().next().value;
    if (lruKey === undefined) break;
    const lru = clientPool.get(lruKey);
    clientPool.delete(lruKey);
    if (lru) closeClient(lru);
  }

  const client = createClient(endpoint);
  clientPool.set(endpoint, client);
  return client;
}

/** Test hook: close every pooled channel and empty the pool. */
export function __resetClientPool(): void {
  for (const client of clientPool.values()) closeClient(client);
  clientPool.clear();
}

/** Test hook: current pool occupancy. */
export function __clientPoolSize(): number {
  return clientPool.size;
}

/** The configured pool cap — exported for tests/observability. */
export const CLIENT_POOL_LIMIT = CLIENT_POOL_MAX;

export interface ProbeResult {
  latestBlock: number;
  lavaEpoch: number;
  lavaLatestBlock: number;
  latencyMs: number;
}

export async function probeProvider(
  endpoint: string,
  specId: string,
  apiInterface: string,
): Promise<ProbeResult> {
  const client = getClient(endpoint);

  const guid = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
  const start = performance.now();

  const reply = await new Promise<{
    guid: number;
    latestBlock: number;
    lavaEpoch: number;
    lavaLatestBlock: number;
  }>((resolve, reject) => {
    const deadline = new Date(Date.now() + PROBE_TIMEOUT_MS);
    // grpc-js client methods need `this` = client; calling a detached
    // reference like `const p = client.probe; p(...)` crashes inside
    // checkOptionalUnaryResponseArguments. Keep the call on the client.
    type ProbeFn = (
      req: unknown,
      opts: unknown,
      cb: (err: grpc.ServiceError | null, response: unknown) => void,
    ) => void;
    (client.probe as ProbeFn).call(
      client,
      { guid, specId, apiInterface, withVerifications: false },
      { deadline },
      (err: grpc.ServiceError | null, response: unknown) => {
        if (err) reject(err);
        else resolve(response as { guid: number; latestBlock: number; lavaEpoch: number; lavaLatestBlock: number });
      },
    );
  });

  const latencyMs = Math.round(performance.now() - start);

  return {
    latestBlock: reply.latestBlock,
    lavaEpoch: reply.lavaEpoch,
    lavaLatestBlock: reply.lavaLatestBlock,
    latencyMs,
  };
}
