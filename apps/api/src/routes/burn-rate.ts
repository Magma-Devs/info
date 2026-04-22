import type { FastifyInstance } from "fastify";
import { CACHE_TTL } from "../config.js";
import { gqlSafe } from "../graphql/client.js";
import { fetchLatestBlockHeight, fetchTotalSupply } from "../rpc/lava.js";

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_MONTHS = 12;
const MAX_MONTHS = 36;

// ── Types ────────────────────────────────────────────────────────────────────

interface SupplySnapshotNode {
  blockHeight: string; // BigInt → string from PostGraphile
  blockTime: string; // ISO-8601 UTC
  snapshotDate: string; // YYYY-MM-DD
  totalSupply: string; // NUMERIC → string, base units (ulava)
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function burnRateRoutes(app: FastifyInstance) {
  // Replaces lava-ops Job 3 (monthly-burn-rate → burn-ui repo). Historical
  // samples come from the indexer's supply_snapshots table (monthly-17th
  // cadence, snapshotter-owned); the live tip is still read from chain RPC
  // so the current-month delta stays fresh.
  //
  // supply_diff for each row is previous_supply − current_supply, so a
  // positive value means tokens were burned between the two samples. Row 0
  // (newest historical snapshot) diffs against the live tip; the oldest row
  // gets null because there is no earlier sample to compare against.
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

    // Historical samples come from the indexer in a single round trip; the
    // live tip is independent, so run them in parallel.
    const [snapshotData, latestBlock, latestSupply] = await Promise.all([
      gqlSafe<{
        allSupplySnapshots: { nodes: SupplySnapshotNode[] };
      } | null>(
        `query($count: Int!) {
          allSupplySnapshots(
            filter: { status: { equalTo: "ok" } }
            orderBy: SNAPSHOT_DATE_DESC
            first: $count
          ) {
            nodes { blockHeight blockTime snapshotDate totalSupply }
          }
        }`,
        { count },
        null,
      ),
      fetchLatestBlockHeight(),
      fetchTotalSupply(),
    ]);

    const nodes = snapshotData?.allSupplySnapshots.nodes ?? [];

    // Nodes are newest-first (SNAPSHOT_DATE_DESC). Row 0 diffs against the
    // live tip; each subsequent row diffs against the row above it; the
    // oldest row (last in the array) gets null because we lack the previous
    // sample needed to compute its burn.
    const blocks = nodes.map((n, i) => {
      const isLast = i === nodes.length - 1;
      const prev = i === 0 ? latestSupply : BigInt(nodes[i - 1]!.totalSupply);
      return {
        block: parseInt(n.blockHeight, 10),
        time: n.blockTime,
        date: n.snapshotDate,
        supply: n.totalSupply,
        supply_diff: isLast ? null : (prev - BigInt(n.totalSupply)).toString(),
      };
    });

    return {
      generated_at: new Date().toISOString(),
      latest: {
        block: latestBlock.height,
        time: latestBlock.time,
        supply: latestSupply.toString(),
      },
      blocks,
    };
  });
}
