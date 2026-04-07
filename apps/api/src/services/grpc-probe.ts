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
  const client = new RelayerClient(endpoint, grpc.credentials.createSsl());

  const guid = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
  const start = performance.now();

  try {
    const reply = await new Promise<{
      guid: number;
      latestBlock: number;
      lavaEpoch: number;
      lavaLatestBlock: number;
    }>((resolve, reject) => {
      const deadline = new Date(Date.now() + PROBE_TIMEOUT_MS);
      client.probe(
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
  } finally {
    client.close();
  }
}
