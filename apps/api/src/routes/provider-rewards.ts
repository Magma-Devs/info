import type { FastifyInstance } from "fastify";
import { gqlSafe } from "../graphql/client.js";
import { fetchProvidersForSpec, fetchAllProviders, fetchLavaUsdPrice, fetchLavaUsdPriceAt, fetchProviderRewardPoolsAmount } from "../rpc/lava.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

const SPEC_ID_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const MAX_RANGE_MS = 6 * 30 * 24 * 60 * 60 * 1000; // ~6 months

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
}

interface AggregateGroup {
  keys: string[];
  sum: AggregateSum;
}

const SUM_FIELDS = `cu relays
              qosSyncSum qosAvailSum qosLatencySum qosCount qosCu`;

// ── Route ────────────────────────────────────────────────────────────────────

export async function providerRewardsRoutes(app: FastifyInstance) {
  app.get("/provider-rewards", {
    schema: {
      tags: ["Provider Rewards"],
      summary: "Per-provider reward distribution in LAVA and USD",
      querystring: {
        type: "object" as const,
        properties: {
          specs: {
            type: "array" as const,
            items: { type: "string" as const },
            description: "Chain/spec IDs to include. Omit for all specs.",
          },
          from: { type: "string" as const, description: "Start date YYYY-MM-DD" },
          to: { type: "string" as const, description: "End date YYYY-MM-DD" },
        },
        required: ["from", "to"] as const,
      },
    },
    config: { cacheTTL: 300 },
  }, async (request, reply) => {
    const q = request.query as {
      specs?: string[];
      from: string;
      to: string;
    };

    // ── Validate spec IDs ──────────────────────────────────────────
    if (q.specs) {
      for (const s of q.specs) {
        if (!validateSpecId(s)) {
          return reply.status(400).send({ error: `Error - bad spec format: ${s}` });
        }
      }
    }

    // ── Validate & normalize dates ─────────────────────────────────
    if (q.from.length !== 10 || q.to.length !== 10) {
      return reply.status(400).send({ error: "Error - bad date format" });
    }

    let dateFrom = new Date(q.from + "T00:00:00Z");
    let dateTo = new Date(q.to + "T00:00:00Z");

    if (isNaN(dateFrom.getTime())) {
      return reply.status(400).send({ error: "Error - bad from date format" });
    }
    if (isNaN(dateTo.getTime())) {
      return reply.status(400).send({ error: "Error - bad to date format" });
    }

    if (dateTo < dateFrom) {
      [dateFrom, dateTo] = [dateTo, dateFrom];
    }

    const from = dateFrom.toISOString().slice(0, 10);
    const to = dateTo.toISOString().slice(0, 10);

    if (dateTo.getTime() - dateFrom.getTime() > MAX_RANGE_MS) {
      return reply.status(400).send({
        error: "Error - date range should not exceed 6 months",
      });
    }

    // ── Resolve specs ─────────────────────────────────────────────
    const specs = q.specs && q.specs.length > 0 ? [...new Set(q.specs)] : null;

    // ── Build GraphQL filter ──────────────────────────────────────
    const filterParts = [
      `date: { greaterThanOrEqualTo: $from, lessThanOrEqualTo: $to }`,
    ];
    const varDefs = [`$from: Date!`, `$to: Date!`];
    const vars: Record<string, unknown> = { from, to };

    if (specs) {
      filterParts.push(`chainId: { in: $specs }`);
      varDefs.push(`$specs: [String!]`);
      vars.specs = specs;
    }

    const filter = filterParts.join(", ");

    // ── Fetch MV data, provider names, LAVA price, and reward pool in parallel ──
    const isHistorical = dateTo < new Date();
    const [mvData, providerMap, lavaPrice, providerPoolUlava] = await Promise.all([
      gqlSafe<{
        mvRelayDailies: { groupedAggregates: AggregateGroup[] };
      }>(`query(${varDefs.join(", ")}) {
        mvRelayDailies(filter: { ${filter} }) {
          groupedAggregates(groupBy: [CHAIN_ID, PROVIDER]) {
            keys
            sum { ${SUM_FIELDS} }
          }
        }
      }`, vars, { mvRelayDailies: { groupedAggregates: [] } }),

      (async () => {
        const map = new Map<string, string>();
        if (specs) {
          const fetches = await Promise.all(
            specs.map((s) => fetchProvidersForSpec(s)),
          );
          for (const providers of fetches) {
            for (const p of providers) {
              if (!map.has(p.address)) map.set(p.address, p.moniker);
            }
          }
        } else {
          for (const p of await fetchAllProviders()) {
            map.set(p.address, p.moniker);
          }
        }
        return map;
      })(),

      (isHistorical ? fetchLavaUsdPriceAt(dateTo) : fetchLavaUsdPrice())
        .catch(() => null as number | null),

      fetchProviderRewardPoolsAmount()
        .catch(() => null as bigint | null),
    ]);

    // Convert provider pool from ulava to LAVA (1 LAVA = 1_000_000 ulava).
    // Safe: pool balance is well under Number.MAX_SAFE_INTEGER (~9B LAVA).
    const providerPoolLava = providerPoolUlava != null
      ? Number(providerPoolUlava) / 1_000_000
      : null;

    // ── Compute adjusted rewards per provider ─────────────────────
    const providerTotals = new Map<string, { moniker: string; adjustedRewards: number; relays: number; cus: number }>();

    for (const agg of mvData.mvRelayDailies.groupedAggregates) {
      const provider = agg.keys[1];
      const moniker = providerMap.get(provider) ?? "";
      const sum = agg.sum;
      const totalCu = Number(sum.cu);
      const totalRelays = Number(sum.relays);
      const qosCount = Number(sum.qosCount);

      const avgLatency = qosCount > 0 ? Number(sum.qosLatencySum ?? 0) / qosCount : 0;
      const avgAvailability = qosCount > 0 ? Number(sum.qosAvailSum ?? 0) / qosCount : 0;
      const avgSync = qosCount > 0 ? Number(sum.qosSyncSum ?? 0) / qosCount : 0;
      const qosCus = Number(sum.qosCu ?? 0);
      const adj = computeAdjustedRewards(avgLatency, avgAvailability, avgSync, qosCus);

      const existing = providerTotals.get(provider);
      if (existing) {
        existing.adjustedRewards += adj;
        existing.relays += totalRelays;
        existing.cus += totalCu;
      } else {
        providerTotals.set(provider, { moniker, adjustedRewards: adj, relays: totalRelays, cus: totalCu });
      }
    }

    // ── Compute shares and USD values ─────────────────────────────
    let totalAdjusted = 0;
    for (const p of providerTotals.values()) totalAdjusted += p.adjustedRewards;

    const providers = [...providerTotals.entries()]
      .map(([address, p]) => {
        const share = totalAdjusted > 0 ? p.adjustedRewards / totalAdjusted : 0;
        const canEstimateUsd = lavaPrice != null && providerPoolLava != null;
        return {
          provider: address,
          moniker: p.moniker,
          relays: p.relays,
          cus: p.cus,
          adjustedRewards: p.adjustedRewards,
          rewardShare: share,
          estimatedRewardsLava: providerPoolLava != null ? share * providerPoolLava : null,
          estimatedRewardsUsd: canEstimateUsd ? share * providerPoolLava! * lavaPrice! : null,
        };
      })
      .sort((a, b) => b.adjustedRewards - a.adjustedRewards);

    return {
      meta: { from, to, lavaUsdPrice: lavaPrice, providerPoolLava, totalAdjustedRewards: totalAdjusted },
      data: providers,
    };
  });
}
