import type { FastifyInstance } from "fastify";
import {
  fetchBlockAtTimestamp,
  fetchLatestBlockHeight,
  fetchTotalSupply,
} from "../rpc/lava.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONTHLY_SNAPSHOT_HOUR_UTC = 15;
const DEFAULT_MONTHS = 12;
const MAX_MONTHS = 36;

function monthlySnapshotTimestamps(count: number): Array<{ date: string; unix: number }> {
  const now = new Date();
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();

  if (now.getUTCDate() < 17) {
    month -= 1;
    if (month < 0) { month += 12; year -= 1; }
  }

  const out: Array<{ date: string; unix: number }> = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(year, month, 17, MONTHLY_SNAPSHOT_HOUR_UTC, 0, 0));
    out.push({
      date: d.toISOString().slice(0, 10),
      unix: Math.floor(d.getTime() / 1000),
    });
    month -= 1;
    if (month < 0) { month += 12; year -= 1; }
  }
  return out;
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function burnRateRoutes(app: FastifyInstance) {
  // Replaces lava-ops Job 3 (monthly-burn-rate → burn-ui repo). Samples total
  // supply at the 17th of each past month, then emits supply_diff (the amount
  // burned or minted between consecutive snapshots).
  app.get("/burn-rate", {
    schema: {
      tags: ["Supply"],
      summary: "Monthly supply snapshots with supply_diff (amount burned per month)",
      querystring: {
        type: "object" as const,
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
    config: { cacheTTL: 86_400 },
  }, async (request) => {
    const q = request.query as { months?: number };
    const count = q.months ?? DEFAULT_MONTHS;
    const snapshots = monthlySnapshotTimestamps(count);

    // Resolve each snapshot to a block, then query total supply at that block.
    // Blocks are returned in descending order (newest first); reverse for diff
    // computation (each entry's supply_diff = previous_supply - own_supply).
    const resolved = await Promise.all(
      snapshots.map(async (s) => {
        try {
          const height = await fetchBlockAtTimestamp(s.unix);
          const supply = await fetchTotalSupply(height);
          return {
            block: height,
            time: new Date(s.unix * 1000).toISOString(),
            date: s.date,
            supply: supply.toString(),
          };
        } catch {
          return null;
        }
      }),
    );

    const [latestBlock, latestSupply] = await Promise.all([
      fetchLatestBlockHeight(),
      fetchTotalSupply(),
    ]);

    const blocks: Array<{
      block: number;
      time: string;
      date: string;
      supply: string;
      supply_diff: string;
    }> = [];

    const valid = resolved.filter((b): b is NonNullable<typeof b> => b !== null);
    for (let i = 0; i < valid.length; i++) {
      const b = valid[i];
      const prev = i === 0
        ? BigInt(latestSupply.toString())
        : BigInt(valid[i - 1].supply);
      const supplyDiff = prev - BigInt(b.supply);
      blocks.push({ ...b, supply_diff: supplyDiff.toString() });
    }

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
