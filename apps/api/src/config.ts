/**
 * Single source of truth for env-var defaults.
 *
 * Import `config` (default) for plain values or pull specific slices via
 * destructure. Every default is also documented in CLAUDE.md's env-var table.
 *
 * Parse once at startup — changes to process.env mid-process are NOT reflected.
 */

function env(name: string): string | undefined {
  return process.env[name];
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw !== undefined ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function envBool(name: string): boolean {
  return process.env[name] === "true";
}

export const config = {
  env: env("NODE_ENV") ?? "production",
  isDev: env("NODE_ENV") === "development",
  isProd: env("NODE_ENV") === "production",

  server: {
    port: envInt("API_PORT", 8080),
    host: env("API_HOST") ?? "0.0.0.0",
    /** true = reflect any origin; array = explicit allowlist. */
    corsOrigins: env("CORS_ORIGINS")
      ? env("CORS_ORIGINS")!.split(",").map((o) => o.trim())
      : (true as true),
    rateLimitMax: envInt("RATE_LIMIT_MAX", 100),
  },

  lava: {
    restUrl: env("LAVA_REST_URL") ?? "https://lava.rest.lava.build",
    rpcUrl: env("LAVA_RPC_URL") ?? "https://lava.tendermintrpc.lava.build:443",
    /** Max concurrent chain-RPC calls per batch loop. Public endpoints should stay modest (~5). */
    rpcBatchSize: Math.max(1, envInt("RPC_BATCH_SIZE", 25)),
  },

  indexer: {
    graphqlUrl: env("INDEXER_GRAPHQL_URL") ?? "http://localhost:3000",
    timeoutMs: envInt("INDEXER_TIMEOUT_MS", 15_000),
  },

  external: {
    coingeckoApiUrl: env("COINGECKO_API_URL") ?? "https://api.coingecko.com/api/v3",
    keybaseApiUrl: env("KEYBASE_API_URL") ?? "https://keybase.io/_/api/1.0",
  },

  redis: {
    url: env("REDIS_URL"),
  },

  relaysDb: {
    url: env("RELAYS_DB_URL"),
  },

  healthProbe: {
    enabled: envBool("ENABLE_HEALTH_PROBE"),
    region: env("HEALTH_PROBE_REGION") ?? "Local",
    intervalMs: envInt("HEALTH_PROBE_INTERVAL_MS", 30_000),
  },

  precompute: {
    /** How often the standalone precompute worker recomputes heavy endpoints. */
    intervalMs: envInt("PRECOMPUTE_INTERVAL_MS", 900_000), // 15 min
  },
} as const;

/**
 * Per-route cache TTLs (seconds). Group by freshness tier so TTL tweaks are
 * one edit — rather than hunting through 30 route files for magic numbers.
 */
export const CACHE_TTL = {
  /** Block-height / realtime chain probes. */
  REAL_TIME: 10,
  /** Per-provider health records pulled from Redis. */
  HEALTH_PROBE: 30,
  /** Default list/aggregate cache window; aligns with MV refresh cadence. */
  LIST: 300,
  /** Search results — slightly longer than lists since queries repeat. */
  SEARCH: 600,
  /** APR computation (expensive, derived from per-entity RPC fan-out). */
  APR: 1800,
  /** Slow-moving validator / claimable rewards data. */
  SLOW_MOVING: 7200,
  /** Optimizer metrics — aggregated hourly scores. */
  OPTIMIZER: 21_600,
  /** Slowly-changing data that's mostly historical but could update
   *  (e.g. avatars, burn-rate overview that mixes historical+latest). */
  HISTORICAL: 86_400,
  /** Truly immutable past-block snapshots — response is fully determined by
   *  historical chain state + block-time CoinGecko prices, both of which
   *  never change. Cache for a year so repeated lookups never pay the
   *  chain-RPC + CoinGecko cost twice. */
  IMMUTABLE: 31_536_000,
} as const;

export default config;
