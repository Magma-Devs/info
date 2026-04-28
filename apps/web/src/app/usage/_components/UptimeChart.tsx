"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { BlockchainIncident, CloudIncident } from "../types";

const GENERIC_CHAIN_TERMS = new Set(["mainnet", "testnet", "other", "sepolia", "goerli"]);

const BLOCKCHAIN_KEYWORDS = [
  "ethereum", "polygon", "arbitrum", "optimism", "base", "solana",
  "avalanche", "bsc", "bnb", "cosmos", "starknet", "zksync", "linea",
  "celo", "near", "aurora", "fantom", "harmony", "aptos", "stellar",
  "algorand", "flow", "filecoin", "palm", "xrp", "btc", "bitcoin",
  "ton", "sui", "zkevm", "scroll", "mantle", "blast", "zora",
  "redstone", "sei", "swell", "unichain", "monad", "sonic", "story",
  "xlayer", "flare", "oasis", "dash", "dogecoin", "litecoin", "tezos",
];

function extractBlockchainName(incident: BlockchainIncident): string {
  const name = incident.name.toLowerCase();
  const chain = incident.chain;

  if (chain && !GENERIC_CHAIN_TERMS.has(chain.toLowerCase())) {
    return chain;
  }

  for (const keyword of BLOCKCHAIN_KEYWORDS) {
    if (name.includes(keyword)) {
      return keyword.charAt(0).toUpperCase() + keyword.slice(1);
    }
  }

  if (name.includes("network") || name.includes("nodes") || name.includes("rpc")) {
    return "Multi-chain";
  }

  if (chain && !GENERIC_CHAIN_TERMS.has(chain.toLowerCase())) {
    return chain;
  }

  return "Infrastructure";
}

interface UptimeDataPoint {
  date: string;
  timestamp: number;
  fullDate: string;
  affectedChains: string;
  incidentCount: number;
  "Lava Network": number;
  "Blockchain RPCs": number;
  "AWS": number;
  "Google Cloud": number;
  "Azure": number;
  "Cloudflare": number;
  "Vercel": number;
  "DigitalOcean": number;
  "Oracle Cloud": number;
}

const CLOUD_PROVIDERS = [
  "AWS",
  "Google Cloud",
  "Azure",
  "Cloudflare",
  "Vercel",
  "DigitalOcean",
  "Oracle Cloud",
] as const;

function buildUptimeData(
  blockchainIncidents: BlockchainIncident[],
  cloudIncidents: CloudIncident[],
  months: number,
): UptimeDataPoint[] {
  // Group blockchain incidents by date (since 2025-01-01)
  const startOf2025 = new Date("2025-01-01");
  const today = new Date();
  const blockchainByDate = new Map<string, { count: number; chains: Set<string> }>();

  for (const incident of blockchainIncidents) {
    const incidentDate = new Date(incident.date);
    if (incidentDate < startOf2025 || incidentDate > today) continue;
    const bucket = blockchainByDate.get(incident.date) ?? { count: 0, chains: new Set<string>() };
    bucket.count++;
    bucket.chains.add(extractBlockchainName(incident));
    blockchainByDate.set(incident.date, bucket);
  }

  // Group cloud incidents by provider+date
  const cloudByProvider = new Map<string, Map<string, number>>();
  for (const provider of CLOUD_PROVIDERS) {
    cloudByProvider.set(provider, new Map());
  }
  for (const incident of cloudIncidents) {
    const incidentDate = new Date(incident.date);
    if (incidentDate < startOf2025 || incidentDate > today) continue;
    const map = cloudByProvider.get(incident.provider);
    if (!map) continue;
    map.set(incident.date, (map.get(incident.date) ?? 0) + 1);
  }

  const startDate = new Date(today);
  startDate.setMonth(startDate.getMonth() - months);
  const days = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  const data: UptimeDataPoint[] = [];

  for (let i = 0; i <= days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().slice(0, 10);

    const blockchainBucket = blockchainByDate.get(dateStr);
    const blockchainImpact = blockchainBucket
      ? Math.min(blockchainBucket.count * 0.6, 10)
      : 0;
    const blockchainUptime = blockchainBucket ? Math.max(85, 100 - blockchainImpact) : 100;

    const uptimeFor = (provider: (typeof CLOUD_PROVIDERS)[number], factor: number) => {
      const incidents = cloudByProvider.get(provider)?.get(dateStr) ?? 0;
      return incidents > 0 ? Math.max(85, 100 - incidents * factor) : 100;
    };

    data.push({
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      timestamp: date.getTime(),
      fullDate: dateStr,
      "Lava Network": 100,
      "Blockchain RPCs": blockchainUptime,
      affectedChains: blockchainBucket ? Array.from(blockchainBucket.chains).join(", ") : "",
      incidentCount: blockchainBucket?.count ?? 0,
      "AWS": uptimeFor("AWS", 2),
      "Google Cloud": uptimeFor("Google Cloud", 2),
      "Azure": uptimeFor("Azure", 2),
      "Cloudflare": uptimeFor("Cloudflare", 0.5),
      "Vercel": uptimeFor("Vercel", 2),
      "DigitalOcean": uptimeFor("DigitalOcean", 2),
      "Oracle Cloud": uptimeFor("Oracle Cloud", 2),
    });
  }

  return data;
}

interface TooltipEntry {
  color: string;
  name: string;
  value: number;
  payload: UptimeDataPoint;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg max-w-sm">
      <p className="font-semibold mb-2">{label}</p>
      {payload.map((entry, idx) => (
        <div key={idx} className="flex items-center gap-2 text-sm mb-1">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
          <span>{entry.name}:</span>
          <span className="font-semibold">{entry.value.toFixed(2)}%</span>
        </div>
      ))}

      {point?.affectedChains && point.incidentCount > 0 && (
        <div className="mt-2 pt-2 border-t border-border text-xs text-muted-foreground">
          <p className="font-semibold text-red-500">
            {point.incidentCount} incident{point.incidentCount > 1 ? "s" : ""}
          </p>
          <p className="mt-1">
            <span className="font-medium">Affected chains:</span>
            <br />
            <span className="text-orange-400">{point.affectedChains}</span>
          </p>
        </div>
      )}
    </div>
  );
}

interface UptimeChartProps {
  blockchainIncidents: BlockchainIncident[];
  cloudIncidents: CloudIncident[];
  selectedPeriod: 3 | 6 | 12;
  onPeriodChange: (period: 3 | 6 | 12) => void;
}

const PERIOD_OPTIONS: { value: 3 | 6 | 12; label: string }[] = [
  { value: 3, label: "3 Months" },
  { value: 6, label: "6 Months" },
  { value: 12, label: "1 Year" },
];

export function UptimeChart({
  blockchainIncidents,
  cloudIncidents,
  selectedPeriod,
  onPeriodChange,
}: UptimeChartProps) {
  const data = useMemo(
    () => buildUptimeData(blockchainIncidents, cloudIncidents, selectedPeriod),
    [blockchainIncidents, cloudIncidents, selectedPeriod],
  );

  return (
    <div className="w-full">
      <div className="flex justify-end mb-8">
        <div className="flex gap-2 rounded-lg bg-muted/30 p-1">
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => onPeriodChange(option.value)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-all ${
                selectedPeriod === option.value
                  ? "bg-accent text-accent-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={data} margin={{ top: 12, right: 24, left: 8, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#222" />
          <XAxis dataKey="date" tick={{ fill: "#888", fontSize: 12 }} tickMargin={8} />
          <YAxis
            domain={[85, 100]}
            tick={{ fill: "#888", fontSize: 12 }}
            label={{ value: "Uptime %", angle: -90, position: "insideLeft", fill: "#888" }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ paddingTop: 24 }} iconType="line" iconSize={14} />
          {/* Cloud providers — slim background lines */}
          <Line type="monotone" dataKey="AWS" stroke="#f59e0b" strokeWidth={1} dot={false} strokeOpacity={0.45} activeDot={{ r: 3 }} />
          <Line type="monotone" dataKey="Google Cloud" stroke="#3b82f6" strokeWidth={1} dot={false} strokeOpacity={0.45} activeDot={{ r: 3 }} />
          <Line type="monotone" dataKey="Azure" stroke="#8b5cf6" strokeWidth={1} dot={false} strokeOpacity={0.45} activeDot={{ r: 3 }} />
          <Line type="monotone" dataKey="Cloudflare" stroke="#ef4444" strokeWidth={1} dot={false} strokeOpacity={0.45} activeDot={{ r: 3 }} />
          <Line type="monotone" dataKey="Vercel" stroke="#06b6d4" strokeWidth={1} dot={false} strokeOpacity={0.45} activeDot={{ r: 3 }} />
          <Line type="monotone" dataKey="DigitalOcean" stroke="#14b8a6" strokeWidth={1} dot={false} strokeOpacity={0.45} activeDot={{ r: 3 }} />
          <Line type="monotone" dataKey="Oracle Cloud" stroke="#ea580c" strokeWidth={1} dot={false} strokeOpacity={0.45} activeDot={{ r: 3 }} />
          {/* Blockchain RPCs — dashed mid-emphasis */}
          <Line
            type="monotone"
            dataKey="Blockchain RPCs"
            stroke="#ec4899"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 4 }}
            strokeDasharray="5 5"
            strokeOpacity={0.75}
          />
          {/* Lava Network — last so it sits on top, thickest line */}
          <Line
            type="monotone"
            dataKey="Lava Network"
            stroke="#10b981"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "#10b981", fill: "#fff" }}
            strokeOpacity={1}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
