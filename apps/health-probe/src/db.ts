import pg from "pg";
import { getConfig } from "./config.js";
import pino from "pino";

const logger = pino({ name: "db" });

let pool: pg.Pool | null = null;
let schemaPrefix: string = "";

function getPool(): pg.Pool {
  if (pool) return pool;
  const config = getConfig();
  if (!/^[a-z_][a-z0-9_]*$/i.test(config.DB_SCHEMA)) {
    throw new Error(`Invalid DB_SCHEMA: ${config.DB_SCHEMA}`);
  }
  schemaPrefix = `"${config.DB_SCHEMA}"`;
  pool = new pg.Pool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASS,
    database: config.DB_DATABASE,
    max: 5,
  });
  return pool;
}

export async function writeHealthStatus(
  provider: string,
  spec: string,
  apiInterface: string,
  geolocation: string,
  status: string,
  data: Record<string, unknown>,
): Promise<void> {
  const p = getPool();
  const id = `${provider}-${spec}-${apiInterface}-${geolocation}`;
  const now = new Date();

  try {
    await p.query(
      `INSERT INTO ${schemaPrefix}.provider_healths (id, provider, timestamp, spec, geolocation, interface, status, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         timestamp = EXCLUDED.timestamp,
         status = EXCLUDED.status,
         data = EXCLUDED.data`,
      [id, provider, now, spec, geolocation, apiInterface, status, JSON.stringify(data)],
    );
  } catch (err) {
    logger.error({ provider, spec, err }, "Failed to write health status");
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
