/**
 * Chain icon resolution — convention-based.
 *
 * Default: /chains/{specId}.svg
 * Aliases handle specIds whose icon filename differs from their specId
 * (e.g. testnet variants, historical naming). New chains work automatically
 * if a {specId}.svg is added to apps/web/public/chains/.
 *
 * Single source of truth for both apps/web (renders the icon directly)
 * and apps/api (embeds absolute URLs in JSON responses so external
 * consumers like burn-ui / lava-rewards can load them cross-origin).
 */

/** Maps lowercased specId → icon filename (without .svg extension). */
const ALIASES: Record<string, string> = {
  agrt: "agr",
  alfajores: "celo",
  apt1: "aptos",
  arbitrum: "arbitrum-one",
  arbitrumn: "arbitrum-nova",
  arbitrums: "arbitrum-nova",
  avaxt: "avalanche",
  avax: "avalanche",
  avalanchec: "avalanche-c",
  avalanchect: "avalanche-c",
  avalanchep: "avalanche-p",
  avalanchept: "avalanche-p",
  axelart: "axelar",
  bases: "base",
  bch: "bitcoincash",
  bcht: "bitcoincash",
  berat: "bera",
  berat2: "bera",
  blastsp: "blast",
  bsc: "bsc",
  bsct: "bsc",
  btc: "bitcoin",
  btct: "bitcoin",
  cardanot: "cardano",
  caspert: "casper",
  celestiat: "celestia",
  celestiata: "celestia",
  celestiatm: "celestia",
  cosmoshub: "cosmos-hub",
  cosmoshubt: "cosmos-hub",
  doget: "doge",
  eth1: "ethereum",
  evmost: "evmos",
  ftm250: "fantom",
  ftm4002: "fantom",
  fvm: "filecoin",
  fvmt: "filecoin",
  hederat: "hedera",
  hol1: "ethereum",
  hyperliquidt: "hyperliquid",
  injectivet: "injective",
  iotat: "iota",
  junt1: "jun1",
  koiit: "koii",
  lav1: "lava",
  ltct: "ltc",
  mantapacifict: "mantapacific",
  monadt: "monad",
  movementt: "movement",
  neart: "near",
  optm: "optimism",
  optms: "optimism",
  osmosist: "osmosis",
  polkadotassethubt: "polkadotassethub",
  polygon: "polygon",
  polygona: "polygon",
  scrolls: "scroll",
  secretp: "secret",
  sep1: "ethereum",
  solanat: "solana",
  sonict: "sonic",
  spark: "fuse",
  strgz: "stargaze",
  strgzt: "stargaze",
  stridet: "stride",
  strk: "starknet",
  strks: "starknet",
  suit: "sui",
  tezost: "tezos",
  tont: "ton",
  trx: "tron",
  trxt: "tron",
  uniont: "union",
  worldchains: "worldchain",
  xlm: "stellar",
  xlmt: "stellar",
  xrpt: "xrp",
  zksyncsp: "zksync",
};

/** Returns the icon filename (no extension) for a given specId. */
export function getChainIconFilename(specId: string): string {
  return ALIASES[specId.toLowerCase()] ?? specId.toLowerCase();
}

/**
 * Returns the icon URL for a given specId.
 *
 * - `baseUrl` undefined → root-relative (`/chains/<slug>.svg`). The web
 *   app uses this — the browser resolves against its own origin, which
 *   already serves the files from apps/web/public/chains/.
 * - `baseUrl` provided  → absolute (`<baseUrl>/chains/<slug>.svg`).
 *   The API uses this so downstream consumers (burn-ui, lava-rewards)
 *   can load icons cross-origin without needing to know the FE host
 *   themselves. The API's default comes from config.icons.baseUrl
 *   (env `INFO_ICONS_BASE_URL`, default `https://info.lavanet.xyz`).
 *
 * Trailing slashes on baseUrl are tolerated.
 */
export function getChainIconUrl(specId: string, baseUrl?: string): string {
  const path = `/chains/${getChainIconFilename(specId)}.svg`;
  if (!baseUrl) return path;
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}
