import type { FastifyInstance } from "fastify";
import { CACHE_TTL } from "../config.js";
import { gqlSafe } from "../graphql/client.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_MONTHS = 12;
const MAX_MONTHS = 36;

interface SupplySnapshotNode {
  snapshotDate: string;  // YYYY-MM-DD
  blockHeight: string;   // BIGINT as string
  blockTime: string;     // ISO8601 with offset
  totalSupply: string;   // NUMERIC as string — ulava base units
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function burnRateRoutes(app: FastifyInstance) {
  // Monthly supply snapshots with supply_diff (LAVA burned or minted per
  // month). Source: the lava-indexer's app.supply_snapshots table, exposed
  // via PostGraphile as allSupplySnapshots. Each row is the chain's total
  // LAVA supply at a pinned monthly-17th block, recorded once at snapshot
  // time by the indexer's supply snapshotter.
  //
  // Pre-migration this endpoint queried the chain directly (one
  // fetchBlockAtTimestamp + fetchTotalSupply per month), which was both
  // slow and rate-limit-prone (429s from the public LB dropped random
  // months to supply=0, corrupting the diff calculation for the next
  // month too). The indexer-backed path is a single GraphQL round trip
  // with deterministic values — one row per month with no gaps.
  app.get("/burn-rate", {
    schema: {
      tags: ["Supply"],
      summary: "Monthly supply snapshots with supply_diff (amount burned per month)",
      querystring: {
        type: "object" as const,
        additionalProperties: false,
        properties: {
          months: {
            type: "integer" as const,
            minimum: 1,
            maximum: MAX_MONTHS,
            description: `Number of monthly snapshots to return (default ${DEFAULT_MONTHS}, max ${MAX_MONTHS})`,
          },
        },
      },
    },
    config: { cacheTTL: CACHE_TTL.HISTORICAL },
  }, async (request) => {
    const q = request.query as { months?: number };
    const count = q.months ?? DEFAULT_MONTHS;

    // Newest first — matches the response ordering the FE and the
    // pre-migration chain path both emitted.
    const data = await gqlSafe<{
      allSupplySnapshots: { nodes: SupplySnapshotNode[] };
    } | null>(
      `query($first: Int!) {
        allSupplySnapshots(
          filter: { status: { equalTo: "ok" } }
          orderBy: SNAPSHOT_DATE_DESC
          first: $first
        ) {
          nodes { snapshotDate blockHeight blockTime totalSupply }
        }
      }`,
      { first: count },
      null,
    );

    const nodes = data?.allSupplySnapshots.nodes ?? [];

    // For each row, compute supply_diff = one-month-older.supply - this.supply.
    // Positive = burn (older snapshot held more; tokens destroyed in the
    // interval), negative = mint. Sign convention matches the
    // pre-migration burn-ui static JSON and the burnDataCalculator's
    // `if (item.diff > 0) totalBurn += item.diff` gate.
    //
    // Walking with `nodes[i + 1]` as the reference means the OLDEST row
    // (no older comparison available) ends up with diff = 0. burn-ui
    // treats zero-diff rows as "no burn data" and hides them from the
    // chart / blanks the Burned column in the table — so the
    // un-computable row is the genesis-floor one, not the newest. The
    // newest row (most interesting for the dashboard) always has a
    // computed diff.
    const blocks: Array<{
      block: number;
      time: string;
      date: string;
      supply: string;
      supply_diff: string;
    }> = [];

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      const older = i < nodes.length - 1 ? nodes[i + 1]! : n;
      const supplyDiff = BigInt(older.totalSupply) - BigInt(n.totalSupply);
      blocks.push({
        block: parseInt(n.blockHeight, 10),
        time: n.blockTime,
        date: n.snapshotDate,
        supply: n.totalSupply,
        supply_diff: supplyDiff.toString(),
      });
    }

    // "latest" surfaces the most-recent monthly snapshot rather than the
    // chain tip. The indexer doesn't snapshot at tip — only at the
    // monthly-17th anchor — so there's nothing fresher to show. Keeping
    // the key in the response shape preserves compatibility with the
    // pre-migration clients (burn-ui + any dashboard consumer) without
    // forcing them to compute their own "latest" from blocks[0].
    const latest = nodes.length > 0 ? {
      block: parseInt(nodes[0]!.blockHeight, 10),
      time: nodes[0]!.blockTime,
      supply: nodes[0]!.totalSupply,
    } : null;

    return {
      generated_at: new Date().toISOString(),
      latest,
      blocks,
    };
  });
}
