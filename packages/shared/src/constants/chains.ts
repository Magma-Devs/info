/** Base specs that aren't real chains — exclude from chain lists and UI */
export const BASE_SPECS = new Set([
  "SUIGRPC", "SUIJSONRPC",
  "COSMOSSDK", "COSMOSSDK50", "COSMOSWASM",
  "ETHERMINT", "TENDERMINT", "IBC",
]);

/**
 * Display-name overrides keyed by spec ID (uppercase).
 * Used by `chainDisplayName` when the raw chainName from RPC isn't
 * user-friendly (e.g. chainName="bsc-mainnet" → "BNB Chain Mainnet").
 */
export const CHAIN_DISPLAY_NAMES: Record<string, string> = {
  BSC: "BNB Chain Mainnet",
  BSCT: "BNB Chain Testnet",
  COSMOSHUB: "Cosmos Hub Mainnet",
  COSMOSHUBT: "Cosmos Hub Testnet",
  ETH1: "Ethereum Mainnet",
  FTM4002: "Fantom Testnet",
  FVMT: "Filecoin Testnet",
  HEDERA: "Hedera Hashgraph Mainnet",
  BTC: "Bitcoin Mainnet",
  HOL1: "Ethereum Holesky Testnet",
  LAVA: "Lava Mainnet",
  LAV1: "Lava Testnet",
  MOVEMENTT: "Movement Testnet",
  OPTMS: "Optimism Sepolia Testnet",
  POLYGONA: "Polygon Amoy Testnet",
  SEP1: "Ethereum Sepolia Testnet",
  SOLANAT: "Solana Testnet",
  SONICT: "Sonic Blaze Testnet",
  SPARK: "Fuse Testnet",
  STRKS: "Starknet Sepolia Testnet",
  TRX: "Tron Mainnet",
  TRXT: "Tron Shasta Testnet",
};

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Canonical display name for a chain: prefers the override map, falls
 * back to title-casing the raw chainName from chain RPC.
 */
export function chainDisplayName(chainID: string, chainName: string): string {
  if (CHAIN_DISPLAY_NAMES[chainID]) return CHAIN_DISPLAY_NAMES[chainID];
  return titleCase(chainName);
}

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
