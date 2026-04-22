import type { FastifyInstance, FastifyReply } from "fastify";
import { CACHE_TTL } from "../config.js";
import {
  RPC_BATCH_SIZE,
  fetchAllProviderMonikers,
  fetchAllSpecs,
  fetchLavaUsdPrice,
  fetchRawProviderRewards,
  formatTokenStr,
  prewarmPriceCache,
  processRawProviderRewards,
  type EstimatedRewardsResponse,
  type RewardToken,
  type RewardsBySpecEntry,
  type RewardsSourceBreakdown,
} from "../rpc/lava.js";
import { gqlSafe } from "../graphql/client.js";
import { sendApiError } from "../plugins/error-handler.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

const SPEC_ID_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

// Mirrors the indexer's app.provider_rewards.source_kind encoding. Index 3
// ("Total") is the roll-up row the snapshotter emits when a chain leaves
// info[] empty — we relabel it with the same "<Kind>: <spec>" convention so
// consumers don't have to special-case the roll-up source.
const SOURCE_KIND_LABELS = ["Boost", "Pools", "Subscription", "Total"] as const;

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

// Row shape from app.priced_rewards (exposed as allPricedRewards). Every
// NUMERIC/BigInt field arrives as a string to avoid precision loss on the
// JS Number boundary — we forward them as-is after trimming trailing zeros.
interface PricedRewardNode {
  blockHeight: string;
  snapshotDate: string;
  blockTime: string;
  provider: string;
  spec: string;
  sourceKind: number;
  sourceDenom: string;
  resolvedDenom: string;
  displayDenom: string;
  rawAmount: string;
  displayAmount: string;
  priceUsd: string | null;
  valueUsd: string | null;
}

// One row from app.denom_prices, joined through the denom FK to surface
// the display_denom the UI renders. We expose the full priced set for the
// snapshot date so the dashboard can render a "Token Prices" card strip
// even for denoms that didn't accrue rewards at this particular block.
interface DenomPriceNode {
  priceUsd: string;
  denomByDenomId: {
    denom: string;
    denomMetadatumByDenomId: {
      baseDenom: string;
      suppress: boolean;
    } | null;
  };
}

// TokenPrice is the response shape surfaced in meta.tokenPrices. Source
// denom (e.g. ulava, ibc/...) is kept alongside display denom (lava, axl)
// so the tooltip can flag IBC-resolved denoms the same way the per-token
// breakdown does.
interface TokenPrice {
  source_denom: string;
  display_denom: string;
  price_usd: string;
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

// ── Historical (indexer-backed, pure pass-through) ──────────────────────────
//
// The indexer's app.priced_rewards MV already has IBC-resolved denoms and
// block-time USD pricing baked in — info just groups the rows into the
// legacy (provider → spec → source) shape and forwards them. No CoinGecko,
// no IBC traces, no chain fan-out. Cold fetch is one GraphQL round trip.
//
// Any ?block=N the indexer hasn't snapshotted returns 404 rather than
// falling back to the chain; the FE is driven by
// /provider-estimated-rewards/blocks so it only asks for ones we have.
async function serveHistorical(
  block: number,
  spec: string | undefined,
  reply: FastifyReply,
): Promise<unknown> {
  const data = await gqlSafe<{
    providerRewardsSnapshotByBlockHeight: SnapshotNode | null;
    allPricedRewards: { nodes: PricedRewardNode[] };
  } | null>(
    `query($block: BigInt!) {
      providerRewardsSnapshotByBlockHeight(blockHeight: $block) {
        blockHeight blockTime snapshotDate providerCount status
      }
      allPricedRewards(filter: { blockHeight: { equalTo: $block } }) {
        nodes {
          blockHeight snapshotDate blockTime
          provider spec sourceKind
          sourceDenom resolvedDenom displayDenom
          rawAmount displayAmount priceUsd valueUsd
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

  // Token prices for this snapshot date — fetched as a separate GraphQL
  // roundtrip because snapshotDate is only known after the snapshot row
  // lands. PostGraphile can't express "resolve $date from first query in
  // second filter" in one go. One small follow-up query per cold request
  // is fine; the page caches the full response.
  const pricesData = await gqlSafe<{
    allDenomPrices: { nodes: DenomPriceNode[] };
  } | null>(
    `query($date: Date!) {
      allDenomPrices(filter: { snapshotDate: { equalTo: $date } }) {
        nodes {
          priceUsd
          denomByDenomId {
            denom
            denomMetadatumByDenomId { baseDenom suppress }
          }
        }
      }
    }`,
    { date: snap.snapshotDate },
    null,
  );

  const tokenPrices: TokenPrice[] = (pricesData?.allDenomPrices.nodes ?? [])
    .filter((n) => n.denomByDenomId?.denomMetadatumByDenomId
      && !n.denomByDenomId.denomMetadatumByDenomId.suppress)
    .map((n) => ({
      source_denom: n.denomByDenomId.denom,
      display_denom: n.denomByDenomId.denomMetadatumByDenomId!.baseDenom,
      price_usd: n.priceUsd,
    }))
    // LAVA first, USDC second, rest alphabetical — matches the prod layout
    // the FE card strip was designed around. Keep the sort server-side so
    // every consumer gets the same order without duplicating the rule.
    .sort((a, b) => {
      const aLava = a.display_denom.toLowerCase() === "lava";
      const bLava = b.display_denom.toLowerCase() === "lava";
      if (aLava !== bLava) return aLava ? -1 : 1;
      const aUsdc = a.display_denom.toLowerCase() === "usdc";
      const bUsdc = b.display_denom.toLowerCase() === "usdc";
      if (aUsdc !== bUsdc) return aUsdc ? -1 : 1;
      return a.display_denom.localeCompare(b.display_denom);
    });

  const rows = data?.allPricedRewards.nodes ?? [];
  const specUpper = spec;

  // Pull the LAVA/USD price from any ulava-resolved row — they all carry the
  // same price for a given block (the MV joins a single price point). 0 when
  // the block has no LAVA-denominated rewards priced.
  const lavaRow = rows.find((r) => r.resolvedDenom === "ulava" && r.priceUsd !== null);
  const priceLavaUsd = lavaRow?.priceUsd ? Number(lavaRow.priceUsd) : 0;

  // Group by provider → spec → source. Each row is one RewardToken; multiple
  // rows with the same (provider, spec, source, denom) fold into the same
  // source bucket. In practice the MV emits one row per tuple, but we
  // accumulate safely in case that ever changes.
  const monikerMap = await fetchAllProviderMonikers();

  interface SourceAcc {
    source: string;
    tokens: RewardToken[];
    total_usd: number;
  }
  interface SpecAcc {
    spec: string;
    tokens: RewardToken[];
    total_usd: number;
    sources: Map<string, SourceAcc>;
  }
  interface ProviderAcc {
    provider: string;
    specs: Map<string, SpecAcc>;
    total_usd: number;
  }

  const byProvider = new Map<string, ProviderAcc>();

  for (const row of rows) {
    const specKey = row.spec.toUpperCase();
    if (specUpper && specKey !== specUpper) continue;

    let provAcc = byProvider.get(row.provider);
    if (!provAcc) {
      provAcc = { provider: row.provider, specs: new Map(), total_usd: 0 };
      byProvider.set(row.provider, provAcc);
    }

    let specAcc = provAcc.specs.get(specKey);
    if (!specAcc) {
      specAcc = { spec: specKey, tokens: [], total_usd: 0, sources: new Map() };
      provAcc.specs.set(specKey, specAcc);
    }

    const sourceLabel = `${SOURCE_KIND_LABELS[row.sourceKind] ?? "Unknown"}: ${row.spec}`;
    let srcAcc = specAcc.sources.get(sourceLabel);
    if (!srcAcc) {
      srcAcc = { source: sourceLabel, tokens: [], total_usd: 0 };
      specAcc.sources.set(sourceLabel, srcAcc);
    }

    // priceUsd can be null when the MV has no price for that denom at the
    // block's date. Mirror that in the response: value_usd renders as "$0"
    // so downstream sums stay numeric.
    const valueUsdNum = row.valueUsd ? Number(row.valueUsd) : 0;
    const valueUsdStr = row.priceUsd && Number(row.priceUsd) > 0 && row.valueUsd
      ? `$${formatTokenStr(row.valueUsd)}`
      : "$0";

    const token: RewardToken = {
      source_denom: row.sourceDenom,
      resolved_amount: formatTokenStr(row.rawAmount),
      resolved_denom: row.resolvedDenom,
      display_denom: row.displayDenom,
      display_amount: formatTokenStr(row.displayAmount),
      value_usd: valueUsdStr,
    };

    srcAcc.tokens.push(token);
    srcAcc.total_usd += valueUsdNum;
    specAcc.tokens.push(token);
    specAcc.total_usd += valueUsdNum;
    provAcc.total_usd += valueUsdNum;
  }

  // Resolve chain display names in one pass. Done after grouping so we only
  // fetch when there's at least one row to show.
  let specNames = new Map<string, string>();
  if (byProvider.size > 0) {
    const specs = await fetchAllSpecs();
    specNames = new Map(specs.map((s) => [s.index, s.name]));
  }

  const results: ResultRow[] = [];
  for (const provAcc of byProvider.values()) {
    const rewards: RewardsBySpecEntry[] = [];
    for (const specAcc of provAcc.specs.values()) {
      const sources: RewardsSourceBreakdown[] = [];
      for (const src of specAcc.sources.values()) {
        sources.push({
          source: src.source,
          tokens: src.tokens,
          total_usd: src.total_usd,
        });
      }
      rewards.push({
        chain: specNames.get(specAcc.spec) ?? specAcc.spec,
        spec: specAcc.spec,
        tokens: specAcc.tokens,
        total_usd: specAcc.total_usd,
        sources,
      });
    }
    if (rewards.length === 0) continue;
    results.push({
      provider: provAcc.provider,
      moniker: monikerMap.get(provAcc.provider) || "-",
      rewards,
      total_usd: provAcc.total_usd,
    });
  }

  results.sort((a, b) => b.total_usd - a.total_usd);

  return {
    meta: {
      block,
      spec: spec ?? null,
      priceLavaUsd,
      priceTimestamp: snap.blockTime,
      // Providers that had at least one reward row at this snapshot.
      // Derived from the snapshot row's provider_count — same number the
      // snapshotter emits at ingest time. Prod's "Total Providers" counter
      // (all staked providers, including zero-reward ones) requires a
      // historical chain query we don't yet pin, so only rewards-bearing
      // providers are surfaced here.
      providersWithRewards: snap.providerCount,
      // Full per-denom price set for the snapshot date. Includes denoms
      // that no provider accrued rewards in at this block — the FE card
      // strip renders the chain's full priced-token universe, not just
      // the ones in the rewards rows.
      tokenPrices,
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
