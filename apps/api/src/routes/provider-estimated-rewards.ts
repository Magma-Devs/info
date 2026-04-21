import type { FastifyInstance } from "fastify";
import { CACHE_TTL } from "../config.js";
import {
  RPC_BATCH_SIZE,
  buildHistoricalPriceMap,
  extractBaseDenoms,
  fetchAllProviderMonikers,
  fetchAllSpecs,
  fetchBlockAtTimestamp,
  fetchBlockTime,
  fetchLavaUsdPrice,
  fetchRawProviderRewards,
  prewarmPriceCache,
  processRawProviderRewards,
  type EstimatedRewardsResponse,
  type RewardsBySpecEntry,
} from "../rpc/lava.js";
import { gqlSafe } from "../graphql/client.js";
import { sendApiError } from "../plugins/error-handler.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

const SPEC_ID_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const DEFAULT_MONTHLY_BLOCKS = 12;
const MAX_MONTHLY_BLOCKS = 24;
const MONTHLY_SNAPSHOT_HOUR_UTC = 15; // Matches lava-rewards convention: 17th of each month at 15:00 UTC

function validateSpecId(s: string): boolean {
  return s.length > 2 && s.length <= 50 && SPEC_ID_RE.test(s);
}

// Walk backwards from today, emitting the 17th-at-15:00-UTC of each previous
// month. Skips the current month's 17th if today is before it.
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

export async function providerEstimatedRewardsRoutes(app: FastifyInstance) {
  // Historical monthly snapshot block list. Drives the block-selector dropdown
  // that lava-rewards UI used to build from `block_heights_*.json` files.
  app.get("/provider-estimated-rewards/blocks", {
    schema: {
      tags: ["Provider Rewards"],
      summary: "Historical monthly-17th blocks for which provider rewards can be queried",
      querystring: {
        type: "object" as const,
        additionalProperties: false,
        properties: {
          count: {
            type: "integer" as const,
            minimum: 1,
            maximum: MAX_MONTHLY_BLOCKS,
            description: `Number of monthly snapshots to return (default ${DEFAULT_MONTHLY_BLOCKS}, max ${MAX_MONTHLY_BLOCKS})`,
          },
        },
      },
    },
    config: { cacheTTL: CACHE_TTL.IMMUTABLE },
  }, async (request) => {
    const q = request.query as { count?: number };
    const count = q.count ?? DEFAULT_MONTHLY_BLOCKS;
    const snapshots = monthlySnapshotTimestamps(count);

    const blocks = await Promise.all(
      snapshots.map(async (s) => {
        try {
          const height = await fetchBlockAtTimestamp(s.unix);
          return {
            height,
            time: new Date(s.unix * 1000).toISOString(),
            date: s.date,
          };
        } catch {
          return null;
        }
      }),
    );

    return { data: blocks.filter((b): b is NonNullable<typeof b> => b !== null) };
  });

  app.get("/provider-estimated-rewards", {
    schema: {
      tags: ["Provider Rewards"],
      summary: "Per-provider chain rewards (from estimated_provider_rewards RPC), grouped by spec",
      querystring: {
        type: "object" as const,
        additionalProperties: false,
        properties: {
          block: {
            type: "integer" as const,
            minimum: 1,
            description: "Historical block height (requires archive node). Omit for live/latest.",
          },
          spec: {
            type: "string" as const,
            description: "Filter to a single spec (chain ID, case-insensitive)",
          },
        },
      },
    },
    config: { cacheTTL: CACHE_TTL.APR },
  }, async (request, reply) => {
    const q = request.query as { block?: number; spec?: string };
    const block = q.block && q.block > 0 ? q.block : undefined;

    let spec: string | undefined;
    if (q.spec !== undefined) {
      if (!validateSpecId(q.spec)) {
        return sendApiError(reply, 400, `bad spec format: ${q.spec}`);
      }
      spec = q.spec.toUpperCase();
    }

    // A historical block's response is fully determined by past chain state
    // and block-time CoinGecko prices — both immutable. Cache for a year.
    if (block) request.cacheTTL = CACHE_TTL.IMMUTABLE;

    await prewarmPriceCache();

    let priceTimestamp: string;
    let priceLavaUsd: number | undefined;
    const blockTimeIso = block ? await fetchBlockTime(block) : null;
    if (blockTimeIso) {
      priceTimestamp = blockTimeIso;
    } else {
      priceTimestamp = new Date().toISOString();
      priceLavaUsd = await fetchLavaUsdPrice();
    }

    // ── Resolve addresses ────────────────────────────────────────────────
    // Source of truth is the indexer's `app.providers` table — every provider
    // that's ever been paid a relay, which is a superset of anyone who can
    // have estimated rewards at a historical block. Monikers come from the
    // current chain stake list (fast, cached); providers who've since unstaked
    // won't have a moniker and render as "-" in the FE.
    const [specs, indexerProviders, monikerMap] = await Promise.all([
      fetchAllSpecs(),
      gqlSafe<{ allProviders: { nodes: Array<{ addr: string }> } } | null>(
        `query { allProviders { nodes { addr } } }`,
        undefined,
        null,
      ),
      fetchAllProviderMonikers(),
    ]);
    const specNames = new Map(specs.map((s) => [s.index, s.name]));
    const providerMap = new Map<string, { moniker: string }>();
    const addresses: string[] = [];
    for (const node of indexerProviders?.allProviders.nodes ?? []) {
      addresses.push(node.addr);
      providerMap.set(node.addr, { moniker: monikerMap.get(node.addr) ?? "" });
    }

    // ── LAVA price: kicked off here so it overlaps with the chain fan-out.
    // ~99% of reward denoms are ulava; non-LAVA denoms that actually appear
    // are fetched after fan-out inside the rare-path below. On live (non-block)
    // queries we use the live cache, no override needed.
    let priceOverrides: Record<string, number> | undefined;
    const lavaPricePromise: Promise<Record<string, number>> | null =
      block && blockTimeIso
        ? buildHistoricalPriceMap(new Date(blockTimeIso), ["lava"])
        : null;

    // ── Chain fan-out: per-provider estimated_provider_rewards ──────────
    const rawByAddr = new Map<string, EstimatedRewardsResponse>();
    for (let i = 0; i < addresses.length; i += RPC_BATCH_SIZE) {
      const batch = addresses.slice(i, i + RPC_BATCH_SIZE);
      const raws = await Promise.all(batch.map((addr) => fetchRawProviderRewards(addr, block)));
      batch.forEach((addr, j) => rawByAddr.set(addr, raws[j]!));
    }

    if (lavaPricePromise) {
      try {
        priceOverrides = await lavaPricePromise;
      } catch (err) {
        // Cache plugin skips 4xx/5xx — refusing to ship avoids poisoning the
        // block-keyed cache with a wrong price for a year.
        return sendApiError(
          reply, 503,
          `historical LAVA price unavailable for block ${block} (${blockTimeIso}); please retry: ${(err as Error).message}`,
        );
      }

      // Rare non-LAVA denoms that actually appeared in this block. IBC
      // resolution hits chain denom_trace (cached), so this is cheap.
      const relevantDenoms = await extractBaseDenoms([...rawByAddr.values()]);
      const missing = [...relevantDenoms].filter((d) => priceOverrides![d] === undefined);
      if (missing.length > 0) {
        const extra = await buildHistoricalPriceMap(new Date(blockTimeIso!), missing);
        priceOverrides = { ...priceOverrides, ...extra };
      }
      priceLavaUsd = priceOverrides.lava ?? priceLavaUsd ?? await fetchLavaUsdPrice();
    }

    // ── Format each provider's raw response ─────────────────────────────
    const results: Array<{
      provider: string;
      moniker: string;
      rewards: RewardsBySpecEntry[];
      total_usd: number;
    }> = [];

    for (const [addr, raw] of rawByAddr) {
      const provider = providerMap.get(addr)!;
      let rewards = await processRawProviderRewards(raw, specNames, priceOverrides);
      if (spec) rewards = rewards.filter((r) => r.spec === spec);
      if (rewards.length === 0) continue;

      const totalUsd = rewards.reduce((sum, r) => sum + r.total_usd, 0);
      results.push({
        provider: addr,
        moniker: provider.moniker || "-",
        rewards,
        total_usd: totalUsd,
      });
    }

    results.sort((a, b) => b.total_usd - a.total_usd);

    return {
      meta: {
        block: block ?? null,
        spec: spec ?? null,
        priceLavaUsd: priceLavaUsd ?? 0,
        priceTimestamp,
      },
      data: results,
    };
  });
}
