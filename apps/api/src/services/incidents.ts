/**
 * Live incident-history fetchers for the /usage endpoints.
 *
 * Cloud providers (Cloudflare/GCP/Vercel) expose paginated JSON status APIs.
 * AWS/Azure/DigitalOcean/Oracle don't, so we merge curated baselines
 * (`incident-baselines.ts`) representing typical incident patterns.
 *
 * Blockchain RPC providers (12 in total) use a mix of StatusPage,
 * Instatus, and BetterStack — each with its own page format. This module
 * centralizes the scraping so the route handler stays declarative.
 *
 * No external scraping deps: we use native fetch (via undici) and a small
 * htmlToText helper instead of axios + cheerio, keeping the API container
 * slim.
 */

import {
  AWS_BASELINE,
  AZURE_BASELINE,
  DIGITALOCEAN_BASELINE,
  ORACLE_BASELINE,
  type BaselineIncident,
} from "./incident-baselines.js";

// ── Shared types ─────────────────────────────────────────────────────────────

export interface CloudIncident {
  provider: string;
  name: string;
  date: string;
  timestamp: string;
  impact: string;
  status?: string;
  description?: string;
}

export interface BlockchainIncident {
  provider: string;
  date: string;
  timestamp: string;
  impact: string;
  chain: string;
  name: string;
}

export interface CloudIncidentsResponse {
  generated_at: string;
  total_incidents: number;
  providers: Record<string, number>;
  incidents: CloudIncident[];
}

export interface BlockchainIncidentsResponse {
  summary: {
    by_impact: Record<string, number>;
    total_incidents: number;
  };
  incidents: BlockchainIncident[];
  metadata: {
    providers: string[];
    description: string;
    generated: string;
    year: number;
  };
}

// ── Fetch helpers ────────────────────────────────────────────────────────────

const UA = "Mozilla/5.0 (compatible; LavaInfoBot/1.0)";
const HTTP_TIMEOUT_MS = 15_000;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return await res.text();
}

/**
 * Strip HTML to plain text. We only need body text — the original script used
 * `cheerio.load(html).$('body').text()` and then ran regex on the result, so
 * a tag-stripper is functionally equivalent and saves the cheerio dependency.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ");
}

// ── Cloud incidents ──────────────────────────────────────────────────────────

interface CloudflareIncidentApi {
  name: string;
  created_at: string;
  impact: string;
  status: string;
  incident_updates?: { body?: string }[];
}

async function fetchCloudflareIncidents(): Promise<CloudIncident[]> {
  const incidents: CloudIncident[] = [];
  const maxPages = 5;

  for (let page = 1; page <= maxPages; page++) {
    const url = `https://www.cloudflarestatus.com/api/v2/incidents.json?page=${page}`;
    const data = await fetchJson<{ incidents?: CloudflareIncidentApi[] }>(url).catch(() => ({
      incidents: undefined,
    }));
    if (!data.incidents || data.incidents.length === 0) break;

    for (const inc of data.incidents) {
      incidents.push({
        provider: "Cloudflare",
        name: inc.name,
        date: inc.created_at.split("T")[0]!,
        timestamp: inc.created_at,
        impact: inc.impact,
        status: inc.status,
        description: inc.incident_updates?.[0]?.body ?? "",
      });
    }

    if (data.incidents.length < 50) break;
  }

  return incidents;
}

interface GcpIncidentApi {
  external_desc?: string;
  begin: string;
  end?: string;
  severity?: string;
  most_recent_update?: { text?: string };
}

async function fetchGoogleCloudIncidents(): Promise<CloudIncident[]> {
  const data = await fetchJson<GcpIncidentApi[]>("https://status.cloud.google.com/incidents.json").catch(
    () => [] as GcpIncidentApi[],
  );
  const arr = Array.isArray(data) ? data : [];
  return arr.slice(0, 100).map((inc) => ({
    provider: "Google Cloud",
    name: inc.external_desc || "Service Incident",
    date: inc.begin.split("T")[0]!,
    timestamp: inc.begin,
    impact: inc.severity?.toLowerCase() ?? "minor",
    status: inc.end ? "resolved" : "investigating",
    description: inc.most_recent_update?.text ?? "",
  }));
}

interface VercelIncidentApi {
  name: string;
  created_at: string;
  impact: string;
  status: string;
  incident_updates?: { body?: string }[];
}

async function fetchVercelIncidents(): Promise<CloudIncident[]> {
  const data = await fetchJson<{ incidents?: VercelIncidentApi[] }>(
    "https://www.vercel-status.com/api/v2/incidents.json",
  ).catch(() => ({ incidents: undefined }));
  const incidents = data.incidents ?? [];
  return incidents.slice(0, 100).map((inc) => ({
    provider: "Vercel",
    name: inc.name,
    date: inc.created_at.split("T")[0]!,
    timestamp: inc.created_at,
    impact: inc.impact,
    status: inc.status,
    description: inc.incident_updates?.[0]?.body ?? "",
  }));
}

function baselineToCloudIncident(b: BaselineIncident): CloudIncident {
  return {
    provider: b.provider,
    name: b.name,
    date: b.date,
    timestamp: b.timestamp,
    impact: b.impact,
    status: b.status,
    description: b.description,
  };
}

export async function fetchCloudIncidents(): Promise<CloudIncidentsResponse> {
  // Each fetcher catches its own network errors and returns []; we want
  // partial data over a hard failure when one upstream is flaky.
  const [cloudflare, gcp, vercel] = await Promise.all([
    fetchCloudflareIncidents().catch(() => []),
    fetchGoogleCloudIncidents().catch(() => []),
    fetchVercelIncidents().catch(() => []),
  ]);

  const aws = AWS_BASELINE.map(baselineToCloudIncident);
  const azure = AZURE_BASELINE.map(baselineToCloudIncident);
  const digitalocean = DIGITALOCEAN_BASELINE.map(baselineToCloudIncident);
  const oracle = ORACLE_BASELINE.map(baselineToCloudIncident);

  const allIncidents = [...cloudflare, ...gcp, ...vercel, ...aws, ...azure, ...digitalocean, ...oracle];
  allIncidents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return {
    generated_at: new Date().toISOString(),
    total_incidents: allIncidents.length,
    providers: {
      cloudflare: cloudflare.length,
      google_cloud: gcp.length,
      aws: aws.length,
      azure: azure.length,
      vercel: vercel.length,
      digitalocean: digitalocean.length,
      oracle_cloud: oracle.length,
    },
    incidents: allIncidents,
  };
}

// ── Blockchain incidents ─────────────────────────────────────────────────────

interface BlockchainProvider {
  name: string;
  url: string;
  type: "statuspage" | "instatus-api" | "instatus" | "betterstack";
}

const BLOCKCHAIN_PROVIDERS: BlockchainProvider[] = [
  { name: "Alchemy", url: "https://status.alchemy.com", type: "statuspage" },
  { name: "Infura", url: "https://status.infura.io", type: "statuspage" },
  { name: "QuickNode", url: "https://status.quicknode.com", type: "statuspage" },
  { name: "Blockdaemon", url: "https://status.blockdaemon.com", type: "statuspage" },
  { name: "Tenderly", url: "https://status.tenderly.co", type: "statuspage" },
  { name: "Chainstack", url: "https://status.chainstack.com", type: "instatus-api" },
  { name: "GetBlock", url: "https://getblock.instatus.com", type: "instatus" },
  { name: "Ankr", url: "https://ankr.instatus.com", type: "instatus" },
  { name: "Helius", url: "https://helius.instatus.com", type: "instatus" },
  { name: "Nodies", url: "https://nodies.instatus.com", type: "instatus" },
  { name: "Dwellir", url: "https://dwellir.instatus.com", type: "instatus" },
  { name: "DRPC", url: "https://status.drpc.org", type: "betterstack" },
];

const MAX_PAGES_STATUSPAGE = 30;
const MAX_PAGES_INSTATUS = 5;
const MAX_PAGES_BETTERSTACK = 5;
const MAX_PAGES_INSTATUS_API = 12;
const PARALLEL_PAGES = 5;
const YEAR_2025_START_MS = new Date("2025-01-01T00:00:00Z").getTime();

const CHAIN_KEYWORDS = [
  "ethereum", "polygon", "arbitrum", "optimism", "base", "solana",
  "avalanche", "bnb", "bsc", "fantom", "celo", "gnosis", "linea",
  "scroll", "zksync", "starknet", "aptos", "sui", "near", "cosmos",
  "zkevm", "sepolia", "amoy", "testnet", "mainnet", "devnet",
  "hyperliquid", "story", "provenance", "stellar", "fusaka",
  "polkadot", "flow", "blast", "tron", "mantle", "ink", "sei",
  "hedera", "vana", "ton", "morph", "xrp", "stacks", "cardano",
] as const;

function extractChainFromName(name: string | undefined): string {
  if (!name) return "Other";
  const lower = name.toLowerCase();
  for (const chain of CHAIN_KEYWORDS) {
    if (lower.includes(chain)) {
      return chain.charAt(0).toUpperCase() + chain.slice(1);
    }
  }
  return "Other";
}

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  January: "01", February: "02", March: "03", April: "04", June: "06",
  July: "07", August: "08", September: "09", October: "10",
  November: "11", December: "12",
};

function parseStatusPageTimestamp(timestamp: string, monthName: string, year: number): string {
  const cleaned = timestamp.replace(/<[^>]+>/g, "");
  const match = cleaned.match(/(\w+)\s+(\d+),\s+(\d+):(\d+)/);
  if (match) {
    const [, month, day, hour, minute] = match;
    const monthNum = MONTHS[month!] ?? MONTHS[monthName] ?? "01";
    return `${year}-${monthNum}-${day!.padStart(2, "0")}T${hour!.padStart(2, "0")}:${minute!.padStart(2, "0")}:00Z`;
  }
  const monthNum = MONTHS[monthName] ?? "01";
  return `${year}-${monthNum}-01T00:00:00Z`;
}

function isFrom2025(dateStr: string | undefined): boolean {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  return Number.isFinite(t) && t >= YEAR_2025_START_MS;
}

// ── StatusPage providers (Alchemy, Infura, QuickNode, Blockdaemon, Tenderly) ─

interface StatusPageMonth {
  name: string;
  year: number;
  incidents?: { name: string; impact?: string; timestamp: string }[];
}

async function fetchStatusPagePage(
  provider: BlockchainProvider,
  page: number,
): Promise<BlockchainIncident[]> {
  const data = await fetchJson<{ months?: StatusPageMonth[] }>(`${provider.url}/history.json?page=${page}`).catch(
    () => ({ months: undefined }),
  );
  const incidents: BlockchainIncident[] = [];
  for (const month of data.months ?? []) {
    for (const inc of month.incidents ?? []) {
      const ts = parseStatusPageTimestamp(inc.timestamp, month.name, month.year);
      if (!isFrom2025(ts)) continue;
      incidents.push({
        provider: provider.name,
        date: ts.substring(0, 10),
        timestamp: ts,
        impact: inc.impact ?? "none",
        chain: extractChainFromName(inc.name),
        name: inc.name || "Unnamed incident",
      });
    }
  }
  return incidents;
}

// ── Chainstack (Instatus API) ────────────────────────────────────────────────

interface ChainstackNotice {
  name?: { default?: string; en?: string };
  started?: string;
  createdAt?: string;
  impact?: string;
  components?: { name?: { default?: string; en?: string } }[];
}

async function fetchChainstackPage(page: number): Promise<BlockchainIncident[]> {
  const now = new Date();
  now.setMonth(now.getMonth() - (page - 1));
  now.setDate(1);
  const monthTimestamp = now.getTime();

  const url = `https://api.instatus.com/public/status.chainstack.com/notices/monthly/${monthTimestamp}?page_no=1`;
  const data = await fetchJson<{ month?: { notices?: ChainstackNotice[] } }>(url).catch(() => ({ month: undefined }));
  const notices = data.month?.notices ?? [];

  const incidents: BlockchainIncident[] = [];
  for (const notice of notices) {
    const incidentName = notice.name?.default ?? notice.name?.en ?? "Unnamed incident";
    const timestamp = notice.started ?? notice.createdAt;
    if (!timestamp || !isFrom2025(timestamp)) continue;

    const affectedChains: string[] = [];
    for (const comp of notice.components ?? []) {
      const cname = comp.name?.default ?? comp.name?.en ?? "";
      const chain = extractChainFromName(cname);
      if (chain !== "Other") affectedChains.push(chain);
    }

    incidents.push({
      provider: "Chainstack",
      date: timestamp.substring(0, 10),
      timestamp,
      impact: notice.impact ? notice.impact.toLowerCase().replace("degradedperformance", "minor") : "none",
      chain: affectedChains[0] ?? "Other",
      name: incidentName,
    });
  }
  return incidents;
}

// ── Instatus HTML providers (GetBlock, Ankr, Helius, Nodies, Dwellir) ────────

async function fetchInstatusPage(
  provider: BlockchainProvider,
  page: number,
): Promise<BlockchainIncident[]> {
  const html = await fetchText(`${provider.url}/history/${page}`).catch(() => "");
  if (!html) return [];

  const text = htmlToText(html);
  const sections = text.split(/(?=Resolved|Identified|Investigating)/);
  const incidents: BlockchainIncident[] = [];

  for (const section of sections) {
    const dateMatch = section.match(/([A-Z][a-z]+\s+\d{1,2},\s+202[0-9])/);
    if (!dateMatch) continue;

    const parsedDate = new Date(dateMatch[1]!);
    if (Number.isNaN(parsedDate.getTime())) continue;

    const date = parsedDate.toISOString().substring(0, 10);
    if (!isFrom2025(date)) continue;

    const lines = section.split("\n").filter((l) => l.trim().length > 0);
    let incidentName = `${provider.name} Service Incident`;
    for (let line of lines) {
      line = line.trim();
      if (
        line.length > 15 &&
        line.length < 150 &&
        !/Resolved|Identified|Investigating|Monitoring|Update|This incident|We are|We implemented|http|svg|icon|class|style/i.test(
          line,
        )
      ) {
        incidentName = line;
        break;
      }
    }

    const lower = section.toLowerCase();
    let impact: BlockchainIncident["impact"] = "minor";
    if (lower.includes("critical") || lower.includes("outage")) impact = "critical";
    else if (lower.includes("degraded") || lower.includes("unavailable")) impact = "major";
    else if (lower.includes("maintenance")) impact = "maintenance";

    incidents.push({
      provider: provider.name,
      date,
      timestamp: date,
      impact,
      chain: extractChainFromName(`${incidentName} ${section}`),
      name: incidentName,
    });
  }

  return incidents;
}

// ── DRPC (BetterStack) ───────────────────────────────────────────────────────

async function fetchDRPCPage(page: number): Promise<BlockchainIncident[]> {
  const text = await fetchText(`https://status.drpc.org/history?page=${page}`).catch(() => "");
  if (!text) return [];

  const incidents: BlockchainIncident[] = [];
  const datePattern = /(\d{4}-\d{2}-\d{2})|([A-Z][a-z]{2}\s+\d{1,2}(?:st|nd|rd|th)?,?\s+202[0-9])/g;
  const matches = [...text.matchAll(datePattern)];

  const seen = new Set<string>();
  for (const match of matches) {
    const dateStr = match[0];
    const parsedDate = new Date(dateStr);
    if (Number.isNaN(parsedDate.getTime())) continue;
    const date = parsedDate.toISOString().substring(0, 10);
    if (seen.has(date) || !isFrom2025(date)) continue;
    seen.add(date);

    const idx = match.index ?? 0;
    const context = text.substring(Math.max(0, idx - 200), idx + 200).toLowerCase();
    let impact: BlockchainIncident["impact"] = "minor";
    if (context.includes("critical") || context.includes("outage")) impact = "critical";
    else if (context.includes("degraded") || context.includes("major")) impact = "major";
    else if (context.includes("maintenance")) impact = "maintenance";

    incidents.push({
      provider: "DRPC",
      date,
      timestamp: date,
      impact,
      chain: "Other",
      name: "DRPC Service Incident",
    });
  }

  return incidents;
}

// ── Per-provider orchestration ───────────────────────────────────────────────

async function fetchProvider(provider: BlockchainProvider): Promise<BlockchainIncident[]> {
  let fn: (page: number) => Promise<BlockchainIncident[]>;
  let maxPages: number;

  switch (provider.type) {
    case "statuspage":
      fn = (page) => fetchStatusPagePage(provider, page);
      maxPages = MAX_PAGES_STATUSPAGE;
      break;
    case "instatus-api":
      fn = fetchChainstackPage;
      maxPages = MAX_PAGES_INSTATUS_API;
      break;
    case "instatus":
      fn = (page) => fetchInstatusPage(provider, page);
      maxPages = MAX_PAGES_INSTATUS;
      break;
    case "betterstack":
      fn = fetchDRPCPage;
      maxPages = MAX_PAGES_BETTERSTACK;
      break;
  }

  const allIncidents: BlockchainIncident[] = [];
  const seen = new Set<string>();

  for (let batchStart = 1; batchStart <= maxPages; batchStart += PARALLEL_PAGES) {
    const batchEnd = Math.min(batchStart + PARALLEL_PAGES - 1, maxPages);
    const pages: number[] = [];
    for (let p = batchStart; p <= batchEnd; p++) pages.push(p);

    const results = await Promise.all(pages.map((p) => fn(p).catch(() => [] as BlockchainIncident[])));
    for (const arr of results) {
      for (const inc of arr) {
        const id = `${inc.provider}-${inc.date}-${inc.name}`;
        if (!seen.has(id)) {
          seen.add(id);
          allIncidents.push(inc);
        }
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  return allIncidents;
}

export async function fetchBlockchainIncidents(): Promise<BlockchainIncidentsResponse> {
  const results = await Promise.all(BLOCKCHAIN_PROVIDERS.map((p) => fetchProvider(p).catch(() => [])));
  const allIncidents = results.flat();

  allIncidents.sort((a, b) => {
    const tA = new Date(a.timestamp || a.date).getTime();
    const tB = new Date(b.timestamp || b.date).getTime();
    return tB - tA;
  });

  const byImpact = { critical: 0, minor: 0, maintenance: 0, major: 0 } as Record<string, number>;
  for (const inc of allIncidents) {
    if (byImpact[inc.impact] !== undefined) byImpact[inc.impact]!++;
  }

  const uniqueProviders = [...new Set(allIncidents.map((inc) => inc.provider))].sort();

  return {
    summary: { by_impact: byImpact, total_incidents: allIncidents.length },
    incidents: allIncidents,
    metadata: {
      providers: uniqueProviders,
      description: "All RPC provider incidents for 2025",
      generated: new Date().toISOString(),
      year: 2025,
    },
  };
}
