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

// Reuse gRPC clients per endpoint — avoids TLS handshake per probe call
const clientPool = new Map<string, InstanceType<grpc.ServiceClientConstructor>>();

function getClient(endpoint: string): InstanceType<grpc.ServiceClientConstructor> {
  let client = clientPool.get(endpoint);
  if (client) return client;

  client = new RelayerClient(endpoint, grpc.credentials.createSsl());
  clientPool.set(endpoint, client);
  return client;
}

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
