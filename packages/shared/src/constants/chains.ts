/** Base specs that aren't real chains — exclude from chain lists and UI */
export const BASE_SPECS = new Set([
  "SUIGRPC", "SUIJSONRPC",
  "COSMOSSDK", "COSMOSSDK50", "COSMOSWASM",
  "ETHERMINT", "TENDERMINT", "IBC",
]);

/** Chains that use non-standard block numbering (timestamp-based or record-file-based) */
export const NON_STANDARD_BLOCK_CHAINS = [
  "HYPERLIQUID",
  "HYPERLIQUIDT",
  "HEDERA",
  "HEDERAT",
] as const;

/** Threshold above which a block number is considered non-standard and should be normalized */
export const BLOCK_NORMALIZATION_THRESHOLD = 1_000_000_000_000;

/**
 * Normalize block numbers for chains with non-standard block numbering.
 * HYPERLIQUID uses timestamp-like values (9.2e15+), HEDERA uses record files.
 * Returns 1 for blocks that are 0 or above the threshold.
 */
export function normalizeBlock(
  specId: string,
  block: number,
): number {
  if (!NON_STANDARD_BLOCK_CHAINS.includes(specId as (typeof NON_STANDARD_BLOCK_CHAINS)[number])) {
    return block;
  }
  if (block === 0 || block > BLOCK_NORMALIZATION_THRESHOLD) {
    return 1;
  }
  return block;
}

/** Returns the geolocation label, or "Local" if not set. */
export function resolveGeolocation(region: string | undefined): string {
  return region || "Local";
}
