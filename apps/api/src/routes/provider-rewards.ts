import type { FastifyInstance } from "fastify";
import { CACHE_TTL } from "../config.js";
import { parseYMD } from "@info/shared/utils";
import { gqlSafe } from "../graphql/client.js";
import { fetchProvidersForSpec, fetchAllProviderMonikers } from "../rpc/lava.js";
import { sendApiError } from "../plugins/error-handler.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

const SPEC_ID_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const MAX_RANGE_MS = 6 * 30 * 24 * 60 * 60 * 1000; // ~6 months
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function validateSpecId(s: string): boolean {
  return s.length > 2 && s.length <= 50 && SPEC_ID_RE.test(s);
}

function computeAdjustedRewards(
  avgLat: number, avgAvail: number, avgSync: number, qosCus: number,
): number {
  if (qosCus === 0) return 0;
  return qosCus / 2 + Math.cbrt(avgLat * avgAvail * avgSync) * (qosCus / 2);
}

// ── Types ────────────────────────────────────────────────────────────────────

interface AggregateSum {
  cu: string;
  relays: string;
  qosSyncSum: number | null;
  qosAvailSum: number | null;
  qosLatencySum: number | null;
  qosCount: string;
  qosCu: string;
  exQosSyncSum: number | null;
  exQosAvailSum: number | null;
  exQosLatencySum: number | null;
  exQosCount: string;
}

interface AggregateGroup {
  keys: string[];
  sum: AggregateSum;
}

interface ComputedRow {
  relays: number;
  cus: number;
  qosCus: number;
  avgLatency: number;
  avgAvailability: number;
  avgSync: number;
  avgLatencyExc: number;
  avgAvailabilityExc: number;
  avgSyncExc: number;
  adjustedRewards: number;
}

const SUM_FIELDS = `cu relays
              qosSyncSum qosAvailSum qosLatencySum qosCount qosCu
              exQosSyncSum exQosAvailSum exQosLatencySum exQosCount`;

// Per-group computation. Identical math for provider-level pooled groups
// and per-(provider, spec) groups — the groupBy determines what a "group" means.
function computeFromSum(sum: AggregateSum): ComputedRow {
  const qosCount = Number(sum.qosCount);
  const exQosCount = Number(sum.exQosCount);
  const latSum = Number(sum.qosLatencySum ?? 0);
  const availSum = Number(sum.qosAvailSum ?? 0);
  const syncSum = Number(sum.qosSyncSum ?? 0);
  const exLatSum = Number(sum.exQosLatencySum ?? 0);
  const exAvailSum = Number(sum.exQosAvailSum ?? 0);
  const exSyncSum = Number(sum.exQosSyncSum ?? 0);
  const qosCus = Number(sum.qosCu ?? 0);
  const avgLatency = qosCount > 0 ? latSum / qosCount : 0;
  const avgAvailability = qosCount > 0 ? availSum / qosCount : 0;
  const avgSync = qosCount > 0 ? syncSum / qosCount : 0;
  return {
    relays: Number(sum.relays),
    cus: Number(sum.cu),
    qosCus,
    avgLatency,
    avgAvailability,
    avgSync,
    avgLatencyExc: exQosCount > 0 ? exLatSum / exQosCount : 0,
    avgAvailabilityExc: exQosCount > 0 ? exAvailSum / exQosCount : 0,
    avgSyncExc: exQosCount > 0 ? exSyncSum / exQosCount : 0,
    adjustedRewards: computeAdjustedRewards(avgLatency, avgAvailability, avgSync, qosCus),
  };
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function providerRewardsRoutes(app: FastifyInstance) {
  app.get("/provider-rewards", {
    schema: {
      tags: ["Provider Rewards"],
      summary: "Per-provider (or per-provider-per-spec) adjusted reward shares based on relay QoS data",
      querystring: {
        type: "object" as const,
        additionalProperties: false,
        properties: {
          specs: {
            type: "array" as const,
            items: { type: "string" as const },
            description: "Chain/spec IDs to include. Omit for all specs.",
          },
          from: { type: "string" as const, description: "Start date YYYY-MM-DD" },
          to: { type: "string" as const, description: "End date YYYY-MM-DD" },
          groupBy: {
            type: "string" as const,
            enum: ["provider", "spec"] as const,
            description:
              "Aggregation level. 'provider' (default) pools all chains and returns one row per provider — matches delta's monthly CSV output. 'spec' returns one row per (provider, spec) with per-spec reward shares.",
          },
        },
        required: ["from", "to"] as const,
      },
    },
    config: { cacheTTL: CACHE_TTL.LIST },
  }, async (request, reply) => {
    const q = request.query as {
      specs?: string[];
      from: string;
      to: string;
      groupBy?: "provider" | "spec";
    };

    const groupBy: "provider" | "spec" = q.groupBy === "spec" ? "spec" : "provider";

    // ── Validate spec IDs ──────────────────────────────────────────
    if (q.specs) {
      for (const s of q.specs) {
        if (!validateSpecId(s)) return sendApiError(reply, 400, `bad spec format: ${s}`);
      }
    }

    // ── Validate & normalize dates ─────────────────────────────────
    let dateFrom = parseYMD(q.from);
    if (!dateFrom) return sendApiError(reply, 400, "bad from date format (expected YYYY-MM-DD)");
    let dateTo = parseYMD(q.to);
    if (!dateTo) return sendApiError(reply, 400, "bad to date format (expected YYYY-MM-DD)");

    if (dateTo < dateFrom) {
      [dateFrom, dateTo] = [dateTo, dateFrom];
    }

    const from = dateFrom.toISOString().slice(0, 10);
    const to = dateTo.toISOString().slice(0, 10);

    if (dateTo.getTime() - dateFrom.getTime() > MAX_RANGE_MS) {
      return sendApiError(reply, 400, "date range should not exceed 6 months");
    }

    // Past windows are immutable (MV refreshes catch up to yesterday within a
    // day), so cache them long; current windows follow MV refresh cadence.
    const todayUtc = Date.UTC(
      new Date().getUTCFullYear(),
      new Date().getUTCMonth(),
      new Date().getUTCDate(),
    );
    request.cacheTTL = dateTo.getTime() <= todayUtc - ONE_DAY_MS
      ? CACHE_TTL.HISTORICAL
      : CACHE_TTL.LIST;

    // ── Resolve specs ─────────────────────────────────────────────
    const specs = q.specs && q.specs.length > 0 ? [...new Set(q.specs)] : null;

    // ── Build GraphQL filter ──────────────────────────────────────
    const filterParts = [
      `date: { greaterThanOrEqualTo: $from, lessThan: $to }`,
    ];
    const varDefs = [`$from: Date!`, `$to: Date!`];
    const vars: Record<string, unknown> = { from, to };

    if (specs) {
      filterParts.push(`chainId: { in: $specs }`);
      varDefs.push(`$specs: [String!]`);
      vars.specs = specs;
    }

    const filter = filterParts.join(", ");

    // ── GraphQL groupBy selection ─────────────────────────────────
    // 'provider' mode pools across all chains (required for formula parity
    // with delta — cbrt(avg·avg·avg) is non-linear so per-chain-then-sum
    // would diverge on multi-chain providers).
    // 'spec' mode keeps the chain dimension because each row represents a
    // distinct (provider, spec) reward entry.
    const gqlGroup = groupBy === "spec" ? "[CHAIN_ID, PROVIDER]" : "[PROVIDER]";

    // ── Fetch MV data and provider names in parallel ─────────────
    const [mvData, providerMap] = await Promise.all([
      gqlSafe<{
        allMvRelayDailies: { groupedAggregates: AggregateGroup[] };
      }>(`query(${varDefs.join(", ")}) {
        allMvRelayDailies(filter: { ${filter} }) {
          groupedAggregates(groupBy: ${gqlGroup}) {
            keys
            sum { ${SUM_FIELDS} }
          }
        }
      }`, vars, { allMvRelayDailies: { groupedAggregates: [] } }),

      (async () => {
        if (!specs) return fetchAllProviderMonikers();
        // Spec-scoped: only need monikers for providers on the filtered specs.
        const map = new Map<string, string>();
        const fetches = await Promise.all(specs.map((s) => fetchProvidersForSpec(s)));
        for (const providers of fetches) {
          for (const p of providers) {
            if (!map.has(p.address)) map.set(p.address, p.moniker);
          }
        }
        return map;
      })(),
    ]);

    // NOTE: Unlike other routes, this endpoint uses unweighted row-level QoS
    // averaging (qos{Sync,Avail,Latency}Sum / qosCount) for parity with the
    // delta reference implementation, not the project-default weighted form
    // (qosSyncW / qosWeight). CU sums stay as Number because CU is not ulava
    // — totals are well within Number.MAX_SAFE_INTEGER and the response must
    // be JSON-serializable floats.
    const groups = mvData.allMvRelayDailies.groupedAggregates;

    if (groupBy === "spec") {
      // One row per (provider, spec). Keys: [chainId, provider].
      const rows = groups.map((agg) => {
        const spec = agg.keys[0] ?? "";
        const provider = agg.keys[1] ?? "";
        return {
          provider,
          spec,
          moniker: providerMap.get(provider) ?? "",
          ...computeFromSum(agg.sum),
          rewardShare: 0, // filled in below after per-spec totals are known
        };
      });

      // Within-spec share normalization — each spec's shares sum to 1.
      // (Cross-spec comparison is meaningless because different specs emit
      // different reward amounts per relay.)
      const perSpecTotal = new Map<string, number>();
      for (const r of rows) {
        perSpecTotal.set(r.spec, (perSpecTotal.get(r.spec) ?? 0) + r.adjustedRewards);
      }
      for (const r of rows) {
        const specTotal = perSpecTotal.get(r.spec) ?? 0;
        r.rewardShare = specTotal > 0 ? r.adjustedRewards / specTotal : 0;
      }

      rows.sort((a, b) =>
        a.spec === b.spec
          ? b.adjustedRewards - a.adjustedRewards
          : a.spec.localeCompare(b.spec),
      );

      let totalAdjusted = 0;
      const bySpec: Record<string, number> = {};
      for (const [spec, total] of perSpecTotal) {
        totalAdjusted += total;
        bySpec[spec] = total;
      }

      return {
        meta: { from, to, groupBy: "spec" as const, totalAdjustedRewards: totalAdjusted, bySpec },
        data: rows,
      };
    }

    // Default: one row per provider. Keys: [provider].
    const rows = groups.map((agg) => {
      const provider = agg.keys[0] ?? "";
      return {
        provider,
        moniker: providerMap.get(provider) ?? "",
        ...computeFromSum(agg.sum),
        rewardShare: 0,
      };
    });

    let totalAdjusted = 0;
    for (const r of rows) totalAdjusted += r.adjustedRewards;
    for (const r of rows) {
      r.rewardShare = totalAdjusted > 0 ? r.adjustedRewards / totalAdjusted : 0;
    }

    rows.sort((a, b) => b.adjustedRewards - a.adjustedRewards);

    return {
      meta: { from, to, groupBy: "provider" as const, totalAdjustedRewards: totalAdjusted },
      data: rows,
    };
  });
}
