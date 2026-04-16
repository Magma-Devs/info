import { BASE_SPECS } from "@info/shared/constants";
import { fetchRest } from "./rest.js";

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Display name overrides — keys are specIDs (uppercase) */
const CHAIN_DISPLAY_NAMES: Record<string, string> = {
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

function chainDisplayName(chainID: string, chainName: string): string {
  if (CHAIN_DISPLAY_NAMES[chainID]) return CHAIN_DISPLAY_NAMES[chainID];
  return titleCase(chainName);
}

export async function fetchAllSpecs(): Promise<Array<{ index: string; name: string }>> {
  const data = await fetchRest<{
    chainInfoList: Array<{ chainName: string; chainID: string }>;
  }>("/lavanet/lava/spec/show_all_chains");
  return (data.chainInfoList ?? [])
    .filter((c) => !BASE_SPECS.has(c.chainID))
    .map((c) => ({ index: c.chainID, name: chainDisplayName(c.chainID, c.chainName) }));
}
