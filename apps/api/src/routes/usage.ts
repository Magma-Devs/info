import type { FastifyInstance } from "fastify";
import { CACHE_TTL } from "../config.js";
import { fetchBlockchainIncidents, fetchCloudIncidents } from "../services/incidents.js";

/**
 * /usage routes — back the frontend's Network Uptime & Reliability page.
 *
 * Each handler aggregates incident histories from public status pages and
 * returns the same JSON shape the legacy jsinfo-ui static datasets used.
 * Both responses are cached for 24h (HISTORICAL) — incidents change at most
 * a few times per day, and the cold path fans out to ~20 external services.
 */

const cloudIncidentSchema = {
  type: "object" as const,
  properties: {
    provider: { type: "string" as const },
    name: { type: "string" as const },
    date: { type: "string" as const, description: "YYYY-MM-DD" },
    timestamp: { type: "string" as const, description: "ISO 8601" },
    impact: { type: "string" as const, description: "minor | major | critical | maintenance | none" },
    status: { type: "string" as const },
    description: { type: "string" as const },
  },
  required: ["provider", "name", "date", "timestamp", "impact"],
} as const;

const cloudIncidentsResponseSchema = {
  type: "object" as const,
  description:
    "Aggregated cloud-provider incident history. Cloudflare/GCP/Vercel are pulled live from official status APIs; AWS/Azure/DigitalOcean/Oracle merge curated baselines that capture typical incident volume.",
  properties: {
    generated_at: { type: "string" as const, description: "ISO 8601 timestamp of when this response was assembled" },
    total_incidents: { type: "integer" as const },
    providers: {
      type: "object" as const,
      description: "Per-provider incident counts in this response",
      properties: {
        cloudflare: { type: "integer" as const },
        google_cloud: { type: "integer" as const },
        aws: { type: "integer" as const },
        azure: { type: "integer" as const },
        vercel: { type: "integer" as const },
        digitalocean: { type: "integer" as const },
        oracle_cloud: { type: "integer" as const },
      },
    },
    incidents: {
      type: "array" as const,
      description: "Newest first by timestamp",
      items: cloudIncidentSchema,
    },
  },
  required: ["generated_at", "total_incidents", "providers", "incidents"],
} as const;

const blockchainIncidentSchema = {
  type: "object" as const,
  properties: {
    provider: { type: "string" as const },
    date: { type: "string" as const, description: "YYYY-MM-DD" },
    timestamp: { type: "string" as const, description: "ISO 8601" },
    impact: { type: "string" as const, description: "minor | major | critical | maintenance | none" },
    chain: { type: "string" as const, description: "Best-effort blockchain extracted from the incident name" },
    name: { type: "string" as const },
  },
  required: ["provider", "date", "timestamp", "impact", "chain", "name"],
} as const;

const blockchainIncidentsResponseSchema = {
  type: "object" as const,
  description:
    "Aggregated blockchain RPC-provider incident history scraped from public status pages (Alchemy, Infura, QuickNode, Blockdaemon, Tenderly, Chainstack, GetBlock, Ankr, Helius, Nodies, Dwellir, DRPC). Filtered to incidents from 2025-01-01 onward.",
  properties: {
    summary: {
      type: "object" as const,
      properties: {
        by_impact: {
          type: "object" as const,
          properties: {
            critical: { type: "integer" as const },
            minor: { type: "integer" as const },
            maintenance: { type: "integer" as const },
            major: { type: "integer" as const },
          },
        },
        total_incidents: { type: "integer" as const },
      },
      required: ["by_impact", "total_incidents"],
    },
    incidents: {
      type: "array" as const,
      description: "Newest first by timestamp",
      items: blockchainIncidentSchema,
    },
    metadata: {
      type: "object" as const,
      properties: {
        providers: {
          type: "array" as const,
          items: { type: "string" as const },
          description: "Distinct provider names that appear in `incidents`",
        },
        description: { type: "string" as const },
        generated: { type: "string" as const, description: "ISO 8601 timestamp" },
        year: { type: "integer" as const },
      },
      required: ["providers", "description", "generated", "year"],
    },
  },
  required: ["summary", "incidents", "metadata"],
} as const;

export async function usageRoutes(app: FastifyInstance) {
  app.get(
    "/cloud-incidents",
    {
      schema: {
        tags: ["Usage"],
        summary: "Cloud-provider incident history (Cloudflare/GCP/Vercel + curated baselines)",
        description:
          "Fans out to public status APIs for Cloudflare, Google Cloud, and Vercel and merges curated baseline datasets for AWS, Azure, DigitalOcean, and Oracle Cloud. Sorted newest first. Cached 24h.",
        response: { 200: cloudIncidentsResponseSchema },
      },
      config: { cacheTTL: CACHE_TTL.HISTORICAL },
    },
    async () => fetchCloudIncidents(),
  );

  app.get(
    "/blockchain-incidents",
    {
      schema: {
        tags: ["Usage"],
        summary: "Blockchain RPC-provider incident history (Alchemy, Infura, Chainstack, etc.)",
        description:
          "Scrapes 12 public RPC-provider status pages (StatusPage, Instatus, BetterStack) in parallel and aggregates 2025-onward incidents. Cold call ~30s; cached 24h. Individual upstream failures are tolerated — partial data is preferred over a hard error.",
        response: { 200: blockchainIncidentsResponseSchema },
      },
      config: { cacheTTL: CACHE_TTL.HISTORICAL },
    },
    async () => fetchBlockchainIncidents(),
  );
}
