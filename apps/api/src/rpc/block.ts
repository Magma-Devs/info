// Lava mainnet genesis timestamp (block 1) — used to narrow binary search range.
const LAVA_GENESIS_UNIX = 1_713_350_000; // ~2024-04-17

// LRU-ish cache for timestamp → block height (avoids repeated binary searches).
const blockAtTsCache = new Map<number, number>();
const BLOCK_AT_TS_CACHE_MAX = 200;

export async function fetchLatestBlockHeight(): Promise<{
  height: number;
  time: string;
}> {
  const LAVA_RPC_URL = process.env.LAVA_RPC_URL ?? "https://lava.tendermintrpc.lava.build:443";
  const res = await fetch(`${LAVA_RPC_URL}/status`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const data = (await res.json()) as {
    result: { sync_info: { latest_block_height: string; latest_block_time: string } };
  };
  return {
    height: parseInt(data.result.sync_info.latest_block_height, 10),
    time: data.result.sync_info.latest_block_time,
  };
}

// Binary-search Tendermint blocks to find the block closest to a target unix timestamp.
// Uses linear interpolation to estimate the starting range, reducing iterations from ~23 to ~10.
export async function fetchBlockAtTimestamp(targetUnix: number): Promise<number> {
  const cached = blockAtTsCache.get(targetUnix);
  if (cached !== undefined) return cached;

  const LAVA_RPC_URL = process.env.LAVA_RPC_URL ?? "https://lava.tendermintrpc.lava.build:443";

  async function blockTime(height: number): Promise<number> {
    const res = await fetch(`${LAVA_RPC_URL}/block?height=${height}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`RPC ${res.status}`);
    const data = (await res.json()) as {
      result: { block: { header: { time: string } } };
    };
    return Math.floor(new Date(data.result.block.header.time).getTime() / 1000);
  }

  const { height: latestHeight, time: latestTime } = await fetchLatestBlockHeight();
  const latestUnix = Math.floor(new Date(latestTime).getTime() / 1000);

  if (targetUnix >= latestUnix) return latestHeight;

  // Linear interpolation to narrow the search range
  const genesisUnix = LAVA_GENESIS_UNIX;
  const estimatedHeight = Math.max(1, Math.min(
    latestHeight,
    Math.floor(latestHeight * (targetUnix - genesisUnix) / (latestUnix - genesisUnix)),
  ));
  const margin = 2000;
  let lo = Math.max(1, estimatedHeight - margin);
  let hi = Math.min(latestHeight, estimatedHeight + margin);

  // Verify bounds contain the target; widen if not
  if (await blockTime(lo) > targetUnix) lo = 1;
  if (await blockTime(hi) < targetUnix) hi = latestHeight;

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const t = await blockTime(mid);
    if (t < targetUnix) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  // Evict oldest entry if cache is full
  if (blockAtTsCache.size >= BLOCK_AT_TS_CACHE_MAX) {
    const firstKey = blockAtTsCache.keys().next().value;
    if (firstKey !== undefined) blockAtTsCache.delete(firstKey);
  }
  blockAtTsCache.set(targetUnix, lo);

  return lo;
}
