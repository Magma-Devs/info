import type { FastifyInstance } from "fastify";
import { parseYMD } from "@info/shared/utils";
import { sendApiError } from "../plugins/error-handler.js";

interface MetricRow {
  hourly_timestamp: Date;
  provider: string;
  consumer: string;
  consumer_hostname: string;
  chain: string;
  metrics_count: number;
  sync_score_sum: string | null;
  generic_score_sum: string | null;
  availability_score_sum: string | null;
  latency_score_sum: string | null;
  node_error_rate_sum: string | null;
  entry_index_sum: number | null;
  max_epoch: number | null;
  max_provider_stake: number | null;
  tier_sum: number | null;
  tier_chance_0_sum: string | null;
  tier_chance_1_sum: string | null;
  tier_chance_2_sum: string | null;
  tier_chance_3_sum: string | null;
  tier_metrics_count: number | null;
  selection_availability_sum: string | null;
  selection_latency_sum: string | null;
  selection_sync_sum: string | null;
  selection_stake_sum: string | null;
  selection_composite_sum: string | null;
}

function divOrNull(sum: string | number | null, count: number): number | null {
  if (sum == null || count === 0) return null;
  return Number(sum) / count;
}

function normalizeRow(m: MetricRow) {
  const mc = m.metrics_count;
  const tmc = m.tier_metrics_count ?? 0;

  return {
    hourly_timestamp: m.hourly_timestamp,
    provider: m.provider,
    consumer: m.consumer,
    consumer_hostname: m.consumer_hostname,
    chain_id: m.chain,
    latency_score: divOrNull(m.latency_score_sum, mc),
    availability_score: divOrNull(m.availability_score_sum, mc),
    sync_score: divOrNull(m.sync_score_sum, mc),
    generic_score: divOrNull(m.generic_score_sum, mc),
    node_error_rate: divOrNull(m.node_error_rate_sum, mc),
    entry_index: divOrNull(m.entry_index_sum, mc),
    epoch: m.max_epoch,
    provider_stake: m.max_provider_stake,
    tier_average: divOrNull(m.tier_sum, tmc),
    tier_chances: tmc > 0
      ? {
          tier0: divOrNull(m.tier_chance_0_sum, tmc) ?? 0,
          tier1: divOrNull(m.tier_chance_1_sum, tmc) ?? 0,
          tier2: divOrNull(m.tier_chance_2_sum, tmc) ?? 0,
          tier3: divOrNull(m.tier_chance_3_sum, tmc) ?? 0,
        }
      : null,
    selection_availability: divOrNull(m.selection_availability_sum, mc),
    selection_latency: divOrNull(m.selection_latency_sum, mc),
    selection_sync: divOrNull(m.selection_sync_sum, mc),
    selection_stake: divOrNull(m.selection_stake_sum, mc),
    selection_composite: divOrNull(m.selection_composite_sum, mc),
  };
}

type NormalizedMetric = ReturnType<typeof normalizeRow>;

const METRIC_KEYS = [
  "latency_score", "availability_score", "sync_score", "generic_score",
  "node_error_rate", "entry_index",
  "selection_availability", "selection_latency", "selection_sync",
  "selection_stake", "selection_composite",
] as const;

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Aggregate normalized rows — averages metric values within each group key. */
function aggregate(rows: NormalizedMetric[], keyFn: (r: NormalizedMetric) => string): NormalizedMetric[] {
  const groups = new Map<string, NormalizedMetric[]>();

  for (const r of rows) {
    const key = keyFn(r);
    const group = groups.get(key);
    if (group) group.push(r);
    else groups.set(key, [r]);
  }

  const result: NormalizedMetric[] = [];
  for (const [, group] of groups) {
    if (group.length === 0) continue;
    const base: NormalizedMetric = { ...group[0]! };
    for (const k of METRIC_KEYS) {
      const values = group.map((r) => r[k]).filter((v): v is number => v != null);
      (base as Record<string, unknown>)[k] = values.length > 0 ? avg(values) : null;
    }
    result.push(base);
  }

  return result;
}

function defaultFrom(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d;
}

function clampFrom(from: Date): Date {
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  return from < threeMonthsAgo ? threeMonthsAgo : from;
}

const ALL_COLUMNS = `
  hourly_timestamp, provider, consumer, consumer_hostname, chain,
  metrics_count,
  sync_score_sum, generic_score_sum, availability_score_sum,
  latency_score_sum, node_error_rate_sum, entry_index_sum,
  max_epoch, max_provider_stake,
  tier_sum, tier_metrics_count,
  tier_chance_0_sum, tier_chance_1_sum, tier_chance_2_sum, tier_chance_3_sum,
  selection_availability_sum, selection_latency_sum, selection_sync_sum,
  selection_stake_sum, selection_composite_sum
`;

export async function optimizerMetricsRoutes(app: FastifyInstance) {
  // GET /providers/:addr/optimizer-metrics
  app.get("/providers/:addr/optimizer-metrics", {
    schema: {
      tags: ["Providers"],
      summary: "Consumer optimizer metrics for a provider",
      params: {
        type: "object" as const,
        properties: { addr: { type: "string" as const } },
        required: ["addr"] as const,
      },
      querystring: {
        type: "object" as const,
        properties: {
          from: { type: "string" as const },
          to: { type: "string" as const },
          consumer: { type: "string" as const },
          chain_id: { type: "string" as const },
        },
      },
    },
    config: { cacheTTL: 21600 },
  }, async (request, reply) => {
    if (!app.relaysDb) return sendApiError(reply, 503, "Optimizer metrics not configured");

    try {
      const { addr } = request.params as { addr: string };
      const query = request.query as { from?: string; to?: string; consumer?: string; chain_id?: string };
      const fromRaw = query.from ? parseYMD(query.from) : defaultFrom();
      if (!fromRaw) return sendApiError(reply, 400, "invalid from (expected YYYY-MM-DD)");
      const to = query.to ? parseYMD(query.to) : new Date();
      if (!to) return sendApiError(reply, 400, "invalid to (expected YYYY-MM-DD)");
      const from = clampFrom(fromRaw);

      const conditions = [
        app.relaysDb`provider = ${addr}`,
        app.relaysDb`hourly_timestamp >= ${from}`,
        app.relaysDb`hourly_timestamp <= ${to}`,
      ];

      if (query.consumer && query.consumer !== "all") {
        conditions.push(app.relaysDb`(consumer = ${query.consumer} OR consumer_hostname = ${query.consumer})`);
      }
      if (query.chain_id && query.chain_id !== "all") {
        conditions.push(app.relaysDb`chain = ${query.chain_id}`);
      }

      const rows = await app.relaysDb<MetricRow[]>`
        SELECT ${app.relaysDb.unsafe(ALL_COLUMNS)}
        FROM aggregated_consumer_optimizer_metrics
        WHERE ${conditions.reduce((a, b) => app.relaysDb!`${a} AND ${b}`)}
        ORDER BY hourly_timestamp
      `;

      const normalized = rows.map(normalizeRow);
      const metrics = aggregate(normalized, (r) => String(r.hourly_timestamp));

      const possibleConsumers = [...new Set(rows.map(r => r.consumer).filter(Boolean))] as string[];
      const possibleChainIds = [...new Set(rows.map(r => r.chain).filter(Boolean))] as string[];

      return { metrics, possibleConsumers, possibleChainIds, filters: { provider: addr, from, to } };
    } catch (err) {
      request.log.error({ err }, "Failed to query optimizer metrics for provider");
      return sendApiError(reply, 503, "Optimizer metrics temporarily unavailable");
    }
  });

  // GET /specs/:specId/optimizer-metrics
  app.get("/specs/:specId/optimizer-metrics", {
    schema: {
      tags: ["Specs"],
      summary: "Consumer optimizer metrics for a chain/spec",
      params: {
        type: "object" as const,
        properties: { specId: { type: "string" as const } },
        required: ["specId"] as const,
      },
      querystring: {
        type: "object" as const,
        properties: {
          from: { type: "string" as const },
          to: { type: "string" as const },
          consumer: { type: "string" as const },
        },
      },
    },
    config: { cacheTTL: 21600 },
  }, async (request, reply) => {
    if (!app.relaysDb) return sendApiError(reply, 503, "Optimizer metrics not configured");

    try {
      const { specId } = request.params as { specId: string };
      const query = request.query as { from?: string; to?: string; consumer?: string };
      const fromRaw = query.from ? parseYMD(query.from) : defaultFrom();
      if (!fromRaw) return sendApiError(reply, 400, "invalid from (expected YYYY-MM-DD)");
      const to = query.to ? parseYMD(query.to) : new Date();
      if (!to) return sendApiError(reply, 400, "invalid to (expected YYYY-MM-DD)");
      const from = clampFrom(fromRaw);

      const conditions = [
        app.relaysDb`chain = ${specId}`,
        app.relaysDb`hourly_timestamp >= ${from}`,
        app.relaysDb`hourly_timestamp <= ${to}`,
      ];

      if (query.consumer && query.consumer !== "all") {
        conditions.push(app.relaysDb`(consumer = ${query.consumer} OR consumer_hostname = ${query.consumer})`);
      }

      const rows = await app.relaysDb<MetricRow[]>`
        SELECT ${app.relaysDb.unsafe(ALL_COLUMNS)}
        FROM aggregated_consumer_optimizer_metrics
        WHERE ${conditions.reduce((a, b) => app.relaysDb!`${a} AND ${b}`)}
        ORDER BY hourly_timestamp
      `;

      const normalized = rows.map(normalizeRow);
      const metrics = aggregate(normalized, (r) => `${r.provider}:::${r.hourly_timestamp}`);

      const possibleConsumers = [...new Set(rows.map(r => r.consumer).filter(Boolean))] as string[];
      const providers = [...new Set(rows.map(r => r.provider).filter(Boolean))] as string[];

      return { metrics, possibleConsumers, providers, filters: { specId, from, to } };
    } catch (err) {
      request.log.error({ err }, "Failed to query optimizer metrics for spec");
      return sendApiError(reply, 503, "Optimizer metrics temporarily unavailable");
    }
  });
}
