import type { FastifyInstance, FastifyReply } from "fastify";
import { CACHE_TTL } from "../config.js";
import {
  RPC_BATCH_SIZE,
  buildHistoricalPriceMap,
  extractBaseDenoms,
  fetchAllProviderMonikers,
  fetchAllSpecs,
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

// Mirrors the snapshotter's source_kind encoding in the indexer
// (app.provider_rewards.source_kind).
const SOURCE_KIND_LABELS = ["Boost", "Pools", "Subscription"] as const;

function validateSpecId(s: string): boolean {
  return s.length > 2 && s.length <= 50 && SPEC_ID_RE.test(s);
}

interface SnapshotNode {
  blockHeight: string; // PostGraphile renders BIGINT as string
  blockTime: string;
  snapshotDate: string;
  providerCount: number;
  status: string;
}

interface ProviderRewardNode {
  providerByProviderId: { addr: string };
  chainBySpecId: { name: string }; // spec ID (e.g. "ETH1") — display name resolved downstream
  sourceKind: number;
  denom: string;
  amount: string;
}

interface ResultRow {
  provider: string;
  moniker: string;
  rewards: RewardsBySpecEntry[];
  total_usd: number;
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function providerEstimatedRewardsRoutes(app: FastifyInstance) {
  // GET /provider-estimated-rewards/blocks
  // Lists every monthly snapshot the indexer has successfully ingested.
  // Drives the block-selector dropdown in the FE. Empty array when the
  // indexer's snapshotter hasn't run yet — FE treats that as "no history
  // available" rather than erroring.
  app.get("/provider-estimated-rewards/blocks", {
    schema: {
      tags: ["Provider Rewards"],
      summary: "Monthly-17th blocks the indexer has snapshotted (historical rewards queryable at these heights)",
    },
    config: { cacheTTL: CACHE_TTL.LIST },
  }, async () => {
    const data = await gqlSafe<{
      allProviderRewardsSnapshots: { nodes: SnapshotNode[] };
    } | null>(
      `query {
        allProviderRewardsSnapshots(
          filter: { status: { equalTo: "ok" } }
          orderBy: SNAPSHOT_DATE_DESC
        ) {
          nodes { blockHeight blockTime snapshotDate providerCount status }
        }
      }`,
      undefined,
      null,
    );
    const blocks = (data?.allProviderRewardsSnapshots.nodes ?? []).map((n) => ({
      height: parseInt(n.blockHeight, 10),
      time: n.blockTime,
      date: n.snapshotDate,
    }));
    return { data: blocks };
  });

  app.get("/provider-estimated-rewards", {
    schema: {
      tags: ["Provider Rewards"],
      summary: "Per-provider chain rewards grouped by spec (latest from chain; historical from indexer snapshot)",
      querystring: {
        type: "object" as const,
        additionalProperties: false,
        properties: {
          block: {
            type: "integer" as const,
            minimum: 1,
            description: "Historical snapshot block (must be one returned by /provider-estimated-rewards/blocks). Omit for live/latest.",
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

    if (block) {
      request.cacheTTL = CACHE_TTL.IMMUTABLE;
      return serveHistorical(block, spec, reply);
    }
    return serveLatest(spec);
  });
}

// ── Historical (indexer-backed) ──────────────────────────────────────────────
//
// The indexer snapshotter writes one row per monthly-17th-15:00-UTC block. We
// query that data directly — no chain fan-out, no per-provider retries, no
// archive replica tangles. Cold fetch is a single GraphQL round trip.
//
// Any ?block=N we haven't snapshotted returns 404 rather than falling back to
// the chain; the chain path is slow and unreliable for historical blocks, and
// the FE is driven by /provider-estimated-rewards/blocks so it only asks for
// ones we have.
async function serveHistorical(
  block: number,
  spec: string | undefined,
  reply: FastifyReply,
): Promise<unknown> {
  const data = await gqlSafe<{
    providerRewardsSnapshotByBlockHeight: SnapshotNode | null;
    allProviderRewards: { nodes: ProviderRewardNode[] };
  } | null>(
    `query($block: BigInt!) {
      providerRewardsSnapshotByBlockHeight(blockHeight: $block) {
        blockHeight blockTime snapshotDate providerCount status
      }
      allProviderRewards(filter: { blockHeight: { equalTo: $block } }) {
        nodes {
          providerByProviderId { addr }
          chainBySpecId { name }
          sourceKind denom amount
        }
      }
    }`,
    { block: String(block) },
    null,
  );

  const snap = data?.providerRewardsSnapshotByBlockHeight;
  if (!snap || snap.status !== "ok") {
    return sendApiError(
      reply, 404,
      `no snapshot available for block ${block} — see /provider-estimated-rewards/blocks for the list of queryable snapshots`,
    );
  }

  await prewarmPriceCache();

  // Block-time LAVA price (CoinGecko history). This is the one piece of
  // per-request external state the route still needs — the snapshotter
  // stores raw on-chain amounts only, USD conversion is the reader's job.
  let priceOverrides: Record<string, number>;
  try {
    priceOverrides = await buildHistoricalPriceMap(new Date(snap.blockTime), ["lava"]);
  } catch (err) {
    return sendApiError(
      reply, 503,
      `historical LAVA price unavailable for block ${block} (${snap.blockTime}); please retry: ${(err as Error).message}`,
    );
  }

  // Synthesize the EstimatedRewardsResponse shape processRawProviderRewards
  // expects from the flat indexer rows — one info entry per (source_kind,
  // spec, denom). The downstream formatter handles IBC resolution + USD
  // math identically to the chain path.
  const rawByAddr = new Map<string, EstimatedRewardsResponse>();
  for (const row of data?.allProviderRewards.nodes ?? []) {
    const addr = row.providerByProviderId.addr;
    let raw = rawByAddr.get(addr);
    if (!raw) {
      raw = { info: [], total: [] };
      rawByAddr.set(addr, raw);
    }
    raw.info.push({
      source: `${SOURCE_KIND_LABELS[row.sourceKind] ?? "Unknown"}: ${row.chainBySpecId.name}`,
      amount: [{ denom: row.denom, amount: row.amount }],
    });
  }

  // Cover the rare non-LAVA denoms that actually appeared. Usually zero
  // extra CoinGecko calls — monthly snapshots are ulava-only in practice.
  const relevantDenoms = await extractBaseDenoms([...rawByAddr.values()]);
  const missing = [...relevantDenoms].filter((d) => priceOverrides[d] === undefined);
  if (missing.length > 0) {
    const extra = await buildHistoricalPriceMap(new Date(snap.blockTime), missing);
    priceOverrides = { ...priceOverrides, ...extra };
  }

  const [specs, monikerMap] = await Promise.all([
    fetchAllSpecs(),
    fetchAllProviderMonikers(),
  ]);
  const specNames = new Map(specs.map((s) => [s.index, s.name]));

  const results: ResultRow[] = [];
  for (const [addr, raw] of rawByAddr) {
    let rewards = await processRawProviderRewards(raw, specNames, priceOverrides);
    if (spec) rewards = rewards.filter((r) => r.spec === spec);
    if (rewards.length === 0) continue;

    const totalUsd = rewards.reduce((sum, r) => sum + r.total_usd, 0);
    results.push({
      provider: addr,
      moniker: monikerMap.get(addr) || "-",
      rewards,
      total_usd: totalUsd,
    });
  }

  results.sort((a, b) => b.total_usd - a.total_usd);

  return {
    meta: {
      block,
      spec: spec ?? null,
      priceLavaUsd: priceOverrides.lava ?? 0,
      priceTimestamp: snap.blockTime,
    },
    data: results,
  };
}

// ── Latest (chain live) ──────────────────────────────────────────────────────
//
// Chain state at tip. Recent blocks live on every replica, so no archive-
// replica gymnastics needed here. Address set is just currently-staked
// providers — unstaked ghosts have $0 accrued now and aren't worth querying.
async function serveLatest(spec: string | undefined): Promise<unknown> {
  await prewarmPriceCache();
  const priceLavaUsd = await fetchLavaUsdPrice();
  const priceTimestamp = new Date().toISOString();

  const [specs, monikerMap] = await Promise.all([
    fetchAllSpecs(),
    fetchAllProviderMonikers(),
  ]);
  const specNames = new Map(specs.map((s) => [s.index, s.name]));
  const addresses = [...monikerMap.keys()];

  const rawByAddr = new Map<string, EstimatedRewardsResponse>();
  for (let i = 0; i < addresses.length; i += RPC_BATCH_SIZE) {
    const batch = addresses.slice(i, i + RPC_BATCH_SIZE);
    const raws = await Promise.all(batch.map((addr) => fetchRawProviderRewards(addr)));
    batch.forEach((addr, j) => rawByAddr.set(addr, raws[j]!));
  }

  const results: ResultRow[] = [];
  for (const [addr, raw] of rawByAddr) {
    let rewards = await processRawProviderRewards(raw, specNames);
    if (spec) rewards = rewards.filter((r) => r.spec === spec);
    if (rewards.length === 0) continue;

    const totalUsd = rewards.reduce((sum, r) => sum + r.total_usd, 0);
    results.push({
      provider: addr,
      moniker: monikerMap.get(addr) || "-",
      rewards,
      total_usd: totalUsd,
    });
  }

  results.sort((a, b) => b.total_usd - a.total_usd);

  return {
    meta: {
      block: null,
      spec: spec ?? null,
      priceLavaUsd,
      priceTimestamp,
    },
    data: results,
  };
}
