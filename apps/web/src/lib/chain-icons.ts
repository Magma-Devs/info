/**
 * Chain icon resolution — convention-based.
 * Default: /chains/{specId}.svg
 * Aliases handle specIds whose icon filename differs from their specId.
 * New chains work automatically if a {specId}.svg is added to public/chains/.
 */

/** Maps specId (lowercase) → icon filename (without .svg extension) */
const ALIASES: Record<string, string> = {
  alfajores: "celo",
  apt1: "aptos",
  arbitrum: "arbitrum-one",
  arbitrumn: "arbitrum-nova",
  arbitrums: "arbitrum-nova",
  avaxt: "avalanche",
  avax: "avalanche",
  axelart: "axelar",
  bases: "base",
  bch: "bitcoincash",
  bcht: "bitcoincash",
  blastsp: "blast",
  bsc: "bsc",
  bsct: "bsc",
  btc: "bitcoin",
  btct: "bitcoin",
  celestiat: "celestia",
  cosmoshub: "cosmos-hub",
  cosmoshubt: "cosmos-hub",
  eth1: "ethereum",
  evmost: "evmos",
  ftm250: "fantom",
  ftm4002: "fantom",
  fvm: "filecoin",
  fvmt: "filecoin",
  hederat: "hedera",
  hol1: "ethereum",
  hyperliquidt: "hyperliquid",
  movementt: "movement",
  neart: "near",
  optm: "optimism",
  optms: "optimism",
  polygon: "polygon",
  polygona: "polygon",
  sep1: "ethereum",
  solanat: "solana",
  sonict: "sonic",
  spark: "fuse",
  strgz: "stargaze",
  strgzt: "stargaze",
  strk: "starknet",
  strks: "starknet",
  trx: "tron",
  trxt: "tron",
  uniont: "union",
  xlm: "stellar",
  xlmt: "stellar",
};

export function getChainIcon(specId: string): string {
  const key = specId.toLowerCase();
  const name = ALIASES[key] ?? key;
  return `/chains/${name}.svg`;
}
