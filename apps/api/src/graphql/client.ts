import pino from "pino";
import { Agent, setGlobalDispatcher } from "undici";

const logger = pino({ name: "graphql" });
const INDEXER_GRAPHQL_URL = process.env.INDEXER_GRAPHQL_URL ?? "http://localhost:3000";
const GQL_TIMEOUT_MS = parseInt(process.env.INDEXER_TIMEOUT_MS ?? "15000", 10);

// Shared connection pool — reuses TCP/TLS across outbound requests so each
// call saves the ~50-100ms handshake cost. Applies to all fetch() in the
// process via undici's global dispatcher.
setGlobalDispatcher(
  new Agent({
    connections: 32,
    keepAliveTimeout: 30_000,
    keepAliveMaxTimeout: 60_000,
  }),
);

export async function gql<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(INDEXER_GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(GQL_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`GraphQL request failed: ${res.status}`);

  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

/**
 * Same as gql() but returns the fallback value on any error instead of throwing.
 * Use for indexer queries in routes that also fetch from chain RPC,
 * so the route degrades gracefully when the indexer is down.
 */
export async function gqlSafe<T>(query: string, variables: Record<string, unknown> | undefined, fallback: T): Promise<T> {
  try {
    return await gql<T>(query, variables);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "Indexer query failed, using fallback");
    return fallback;
  }
}
