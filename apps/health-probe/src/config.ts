import { z } from "zod";

const envSchema = z.object({
  PROVIDERS_URL: z.string().url().default("https://info.lavanet.xyz/providers"),
  NODE_URL: z.string().url().default("https://public-rpc.lavanet.xyz:443"),
  HEALTH_PROBE_HTTP_PORT: z.coerce.number().default(6500),
  HEALTH_PROBE_HTTP_HOST: z.string().default("0.0.0.0"),
  REGION: z.string().default("Local"),
  LAVAD_PATH: z.string().default("lavad"),
  LAVAP_PATH: z.string().default("lavap"),
  HEALTH_CONFIG_PATH: z.string().default("external_configs/health_all_providers.yml"),
  // Indexer Postgres (remote — the SubQuery-managed DB)
  DB_HOST: z.string().default("localhost"),
  DB_PORT: z.coerce.number().default(5432),
  DB_USER: z.string().default("postgres"),
  DB_PASS: z.string().default("postgres"),
  DB_DATABASE: z.string().default("postgres"),
  DB_SCHEMA: z.string().default("app"),
});

export type Config = z.infer<typeof envSchema>;

let config: Config | null = null;

export function getConfig(): Config {
  if (config) return config;
  config = envSchema.parse(process.env);
  return config;
}
