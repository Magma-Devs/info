"use client";

import React, { use, useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useApi } from "@/hooks/use-api";
import { Loading } from "@/components/data/Loading";
import { StatCard } from "@/components/data/StatCard";
import { ChainLink } from "@/components/data/ChainLink";
import { getChainIcon } from "@/lib/chain-icons";
import { ProviderLink } from "@/components/data/ProviderLink";
import { LavaAmount } from "@/components/data/LavaAmount";
import { TimeTooltip } from "@/components/data/TimeTooltip";

const ProviderChart = dynamic(() => import("@/components/data/ProviderChart").then((m) => m.ProviderChart), { ssr: false });
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { SortableTable } from "@/components/data/SortableTable";
import { type ColumnDef, type Row } from "@tanstack/react-table";
import { formatNumber, formatNumberKMB, formatLava } from "@/lib/format";
import { Coins, MonitorCog, ArrowUpNarrowWide, Award, BarChart3, Percent, Copy, ExternalLink, ChevronRight } from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import { geoLabel } from "@info/shared";

const COLORS = ["#ac4c39", "#ab5a49", "#e07a5f", "#f2cc8f", "#81b29a", "#3d405b", "#f4f1de", "#e8a87c"];

const INTERFACE_COLORS: Record<string, string> = {
  jsonrpc: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  rest: "bg-amber-600/15 text-amber-300 border-amber-600/30",
  grpc: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  tendermintrpc: "bg-orange-600/15 text-orange-300 border-orange-600/30",
};
const DEFAULT_IFACE_COLOR = "bg-amber-500/15 text-amber-400 border-amber-500/30";

const GEO_COLORS: Record<string, string> = {
  "US-Center": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Europe": "bg-blue-600/15 text-blue-300 border-blue-600/30",
  "US-East": "bg-blue-400/15 text-blue-300 border-blue-400/30",
  "US-West": "bg-sky-500/15 text-sky-400 border-sky-500/30",
  "Africa": "bg-sky-600/15 text-sky-300 border-sky-600/30",
  "Asia": "bg-blue-700/15 text-blue-200 border-blue-700/30",
  "AU/NZ": "bg-sky-400/15 text-sky-300 border-sky-400/30",
};
const DEFAULT_GEO_COLOR = "bg-blue-500/15 text-blue-400 border-blue-500/30";

import type { InterfaceHealth, SpecHealth } from "@/lib/types";

interface ProviderDetail {
  provider: string;
  moniker: string;
  identity?: string;
  stakes: Array<{
    specId: string;
    stake: string;
    delegation: string;
    moniker: string;
    delegateCommission?: string;
    geolocation?: number;
    addons?: string;
    extensions?: string;
    status?: string;
    health?: SpecHealth | null;
  }>;
}

interface ChartEntry {
  chainId: string;
  cu: string;
  relays: string;
}

interface TimeSeriesEntry {
  date: string;
  chainId: string;
  cu: string;
  relays: string;
  qosSync: number | null;
  qosAvailability: number | null;
  qosLatency: number | null;
}


interface DelegatorReward {
  denom: string; amount: string;
}

/* ─── Mock chart data for dev (toggle via Dev Tools > Mock chart data) ─── */
function generateProviderMockData(): TimeSeriesEntry[] {
  const chains = ["ETH1", "LAVA", "COSMOSHUB", "NEAR"];
  const points: TimeSeriesEntry[] = [];
  const now = new Date();
  let seed = 77;
  const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return seed / 2147483647; };
  for (let i = 90; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().slice(0, 10);
    for (const chain of chains) {
      const base: Record<string, number> = { ETH1: 120000, LAVA: 80000, COSMOSHUB: 40000, NEAR: 20000 };
      const relays = Math.round((base[chain] || 50000) * (1 + Math.sin(i * 0.12 + chains.indexOf(chain)) * 0.25) * (1 + (90 - i) * 0.002));
      const dip = i > 35 && i < 50 ? 0.04 : 0;
      points.push({
        date: dateStr, chainId: chain, cu: String(relays * 4), relays: String(relays),
        qosSync: Math.min(1, Math.max(0, 0.996 - dip + (rand() - 0.5) * 0.006)),
        qosAvailability: Math.min(1, Math.max(0, 0.998 - dip * 0.5 + (rand() - 0.5) * 0.003)),
        qosLatency: Math.min(1, Math.max(0, 0.994 - dip + (rand() - 0.5) * 0.008)),
      });
    }
  }
  return points;
}

export default function ProviderPage({ params }: { params: Promise<{ lavaid: string }> }) {
  const { lavaid } = use(params);
  const { data: provider, isLoading } = useApi<ProviderDetail>(`/providers/${lavaid}`);
  const { data: rewards } = useApi<{ data: ChartEntry[] }>(`/providers/${lavaid}/charts`);
  const [rangeDays, setRangeDays] = useState(90);
  const chartFrom = rangeDays > 0 ? new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) : "";
  const { data: tsData } = useApi<{ data: TimeSeriesEntry[] }>(`/providers/${lavaid}/charts${chartFrom ? `?from=${chartFrom}` : ""}`);
const { data: delegatorRewards } = useApi<{ data: DelegatorReward[] }>(`/providers/${lavaid}/delegator-rewards`);
  const avatarIdentity = provider?.identity;
  const { data: avatarResp } = useApi<{ url: string | null }>(
    avatarIdentity ? `/providers/${lavaid}/avatar?identity=${avatarIdentity}` : `/providers/${lavaid}/avatar`
  );

  const [useMockChart, setUseMockChart] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem("lava-mock-chart") === "true",
  );
  useEffect(() => {
    const handler = () => setUseMockChart(localStorage.getItem("lava-mock-chart") === "true");
    window.addEventListener("mock-chart-toggle", handler);
    return () => window.removeEventListener("mock-chart-toggle", handler);
  }, []);
  const providerChartData = useMemo(() => {
    if (useMockChart) {
      const mock = generateProviderMockData();
      if (chartFrom) return mock.filter((p) => p.date >= chartFrom);
      return mock;
    }
    return tsData?.data;
  }, [tsData, useMockChart, chartFrom]);

  const [copied, setCopied] = useState(false);
  const [stakeFilter, setStakeFilter] = useState<"healthy" | "unhealthy" | "all">("all");
  const [geoFilter, setGeoFilter] = useState<string>("all");

  // 30-day CU/relays from the time-series data (default 90d range, filter to last 30d)
  const thirtyDaysAgo = useMemo(() => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), []);
  const { cu30d, relays30d } = useMemo(() => {
    if (!tsData?.data) return { cu30d: 0n, relays30d: 0n };
    let cu = 0n, relays = 0n;
    for (const d of tsData.data) {
      if (d.date >= thirtyDaysAgo) {
        cu += BigInt(d.cu || "0");
        relays += BigInt(d.relays || "0");
      }
    }
    return { cu30d: cu, relays30d: relays };
  }, [tsData, thirtyDaysAgo]);

  // All hooks must be before any early return
  const totalStake = useMemo(() => provider?.stakes.reduce((sum, s) => sum + BigInt(s.stake || "0"), 0n) ?? 0n, [provider]);
  const totalDelegation = useMemo(() => provider?.stakes.reduce((sum, s) => sum + BigInt(s.delegation || "0"), 0n) ?? 0n, [provider]);

  const commissionDisplay = useMemo(() => {
    if (!provider) return null;
    const vals = provider.stakes.map((s) => s.delegateCommission).filter((v): v is string => v != null);
    if (vals.length === 0) return null;
    const counts = new Map<string, number>();
    for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return Number(best) + "%";
  }, [provider]);

  const pieData = useMemo(() => {
    const raw = rewards?.data?.filter((r) => Number(r.relays) > 0) ?? [];
    const total = raw.reduce((sum, r) => sum + Number(r.relays), 0);
    if (total === 0) return [];
    const sorted = raw
      .map((r) => ({ name: r.chainId, value: Number(r.relays) }))
      .sort((a, b) => b.value - a.value);
    // Group slices < 2% into "Other"
    const threshold = total * 0.02;
    const big: typeof sorted = [];
    let otherValue = 0;
    for (const s of sorted) {
      if (s.value >= threshold) big.push(s);
      else otherValue += s.value;
    }
    if (otherValue > 0) big.push({ name: "Other", value: otherValue });
    return big.map((s) => ({ ...s, pct: (s.value / total) * 100 }));
  }, [rewards]);

  type Stake = ProviderDetail["stakes"][number];
  const stakeCols: ColumnDef<Stake, unknown>[] = useMemo(() => [
    { id: "specId", header: "Chain", accessorFn: (r: Stake) => r.specId, cell: ({ row }: { row: { original: Stake } }) => <ChainLink chainId={row.original.specId} showName /> },
    { id: "health", header: "Health", accessorFn: (r: Stake) => r.health?.status ?? "unknown", cell: ({ row }: { row: Row<Stake> }) => {
      const h = row.original.health;
      if (!h) {
        return (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />
            <span className="text-xs">No data</span>
          </div>
        );
      }
      const isHealthy = h.status === "healthy";
      return (
        <button
          type="button"
          onClick={() => row.toggleExpanded()}
          className="flex items-center gap-1.5 group cursor-pointer"
        >
          <ChevronRight size={12} className={`text-muted-foreground transition-transform ${row.getIsExpanded() ? "rotate-90" : ""}`} />
          <span className={`w-2 h-2 rounded-full ${isHealthy ? "bg-green-500" : "bg-red-500"}`} />
          <span className={`text-xs font-medium ${isHealthy ? "text-green-400" : "text-red-400"}`}>
            {isHealthy ? "Healthy" : `${h.unhealthy}/${h.total} Down`}
          </span>
          <span className="text-[10px] text-muted-foreground">
            <TimeTooltip datetime={h.oldestTimestamp} />
          </span>
        </button>
      );
    }},
    { id: "total", header: "Total Stake", accessorFn: (r: Stake) => Number(BigInt(r.stake || "0") + BigInt(r.delegation || "0")), cell: ({ row }: { row: { original: Stake } }) => <LavaAmount amount={String(BigInt(row.original.stake || "0") + BigInt(row.original.delegation || "0"))} /> },
    { id: "stake", header: "Self Stake", meta: { hideOnMobile: true }, accessorFn: (r: Stake) => Number(BigInt(r.stake || "0")), cell: ({ row }: { row: { original: Stake } }) => <LavaAmount amount={row.original.stake} /> },
    { id: "delegation", header: "Delegation", meta: { hideOnMobile: true }, accessorFn: (r: Stake) => Number(BigInt(r.delegation || "0")), cell: ({ row }: { row: { original: Stake } }) => <LavaAmount amount={row.original.delegation} /> },
    { id: "commission", header: "Commission", meta: { hideOnMobile: true }, accessorFn: (r: Stake) => Number(r.delegateCommission || "0"), cell: ({ row }: { row: { original: Stake } }) => `${Number(row.original.delegateCommission || "0")}%` },
    { id: "geolocation", header: "Location", meta: { hideOnMobile: true }, accessorFn: (r: Stake) => r.geolocation ?? 0, cell: ({ row }: { row: { original: Stake } }) => {
      const regions = geoLabel(row.original.geolocation);
      if (regions === "—") return "—";
      return <div className="flex flex-wrap gap-1">{regions.split(", ").map((r) => <span key={r} className={`px-2 py-0.5 rounded-full text-xs font-medium border ${GEO_COLORS[r] ?? DEFAULT_GEO_COLOR}`}>{r}</span>)}</div>;
    }},
    { id: "addonsExtensions", header: "Addons/Extensions", meta: { hideOnMobile: true }, accessorFn: (r: Stake) => `${r.addons || ""} ${r.extensions || ""}`.trim(), cell: ({ row }: { row: { original: Stake } }) => {
      const addons = (row.original.addons || "").split(",").filter(Boolean);
      const extensions = (row.original.extensions || "").split(",").filter(Boolean);
      if (addons.length === 0 && extensions.length === 0) return "—";
      return (
        <div className="flex flex-wrap gap-1">
          {addons.map((a) => <span key={`a-${a}`} className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/15 text-purple-400 border border-purple-500/30">{a.trim()}</span>)}
          {extensions.map((e) => <span key={`e-${e}`} className="px-2 py-0.5 rounded-full text-xs font-medium bg-violet-500/15 text-violet-300 border border-violet-500/30">{e.trim()}</span>)}
        </div>
      );
    }},
  ] as ColumnDef<Stake, unknown>[], []);

  const renderStakeSubRow = (row: Row<Stake>) => {
    const h = row.original.health;
    if (!h?.interfaces?.length) return null;
    return (
      <div className="grid grid-cols-[100px_90px_90px_70px_110px_1fr] gap-x-4 gap-y-2 text-xs items-center">
        <span className="text-muted-foreground font-medium">Interface</span>
        <span className="text-muted-foreground font-medium">Region</span>
        <span className="text-muted-foreground font-medium">Status</span>
        <span className="text-muted-foreground font-medium">Latency</span>
        <span className="text-muted-foreground font-medium">Block</span>
        <span className="text-muted-foreground font-medium text-right">Last checked</span>

        {h.interfaces.map((iface, idx) => {
          const isHealthy = iface.status === "healthy";
          const ifaceColor = INTERFACE_COLORS[iface.name.toLowerCase()] ?? DEFAULT_IFACE_COLOR;
          const geoStr = geoLabel(Number(iface.geolocation));
          const geoColor = GEO_COLORS[geoStr] ?? DEFAULT_GEO_COLOR;
          const key = `${iface.name}-${iface.geolocation}-${idx}`;
          return (
            <React.Fragment key={key}>
              <span className={`px-2 py-0.5 rounded-full font-medium border text-center ${ifaceColor}`}>
                {iface.name}
              </span>
              <span className={`px-2 py-0.5 rounded-full font-medium border text-center truncate ${geoColor}`} title={geoStr}>
                {geoStr}
              </span>
              <span className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${isHealthy ? "bg-green-500" : "bg-red-500"}`} />
                <span className={`font-medium ${isHealthy ? "text-green-400" : "text-red-400"}`}>
                  {iface.status}
                </span>
              </span>
              <span className="text-muted-foreground">
                {isHealthy && iface.latencyMs != null ? `${iface.latencyMs}ms` : "—"}
              </span>
              <span className="text-muted-foreground font-mono">
                {isHealthy && iface.block != null ? iface.block.toLocaleString() : !isHealthy && iface.message ? <span className="text-red-400/70 truncate block max-w-[200px] font-sans" title={iface.message}>{iface.message}</span> : "—"}
              </span>
              <span className="text-right">
                <TimeTooltip datetime={iface.timestamp} />
              </span>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  const allStakes = useMemo(() => provider?.stakes ?? [], [provider]);

  const availableRegions = useMemo(() => {
    const regions = new Set<string>();
    for (const s of allStakes) {
      for (const r of geoLabel(s.geolocation).split(", ")) {
        if (r !== "—") regions.add(r);
      }
    }
    return Array.from(regions).sort();
  }, [allStakes]);

  const healthFiltered = useMemo(() => {
    if (stakeFilter === "all") return allStakes;
    return allStakes.filter(s => s.health?.status === stakeFilter);
  }, [allStakes, stakeFilter]);

  const geoFiltered = useMemo(() => {
    if (geoFilter === "all") return allStakes;
    return allStakes.filter(s => geoLabel(s.geolocation).includes(geoFilter));
  }, [allStakes, geoFilter]);

  const filteredStakes = useMemo(() => {
    if (geoFilter === "all") return healthFiltered;
    return healthFiltered.filter(s => geoLabel(s.geolocation).includes(geoFilter));
  }, [healthFiltered, geoFilter]);

  const healthyCnt = useMemo(() => provider?.stakes.filter(s => s.health?.status === "healthy").length ?? 0, [provider]);
  const unhealthyCnt = useMemo(() => provider?.stakes.filter(s => s.health?.status === "unhealthy").length ?? 0, [provider]);

  if (isLoading) return <Loading />;

  if (!provider) {
    return (
      <>
        <Link href="/providers"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded-md border border-border hover:bg-muted/50 transition-colors">
          &larr; Providers
        </Link>
        <h1 className="text-2xl font-bold mt-4 mb-4">Provider Not Found</h1>
        <p className="text-muted-foreground">No data available for provider: {lavaid}</p>
      </>
    );
  }

  const claimableRewards = delegatorRewards?.data?.find((r) => r.denom === "ulava");

  return (
    <>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/providers"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded-md border border-border hover:bg-muted/50 transition-colors shrink-0">
          &larr; Providers
        </Link>
        <div className="flex items-center gap-3 min-w-0">
          {avatarResp?.url && (
            <img src={avatarResp.url} alt="" className="w-10 h-10 rounded-full shrink-0" />
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight truncate">{provider.moniker || "Unknown Provider"}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-sm text-muted-foreground font-mono truncate">{provider.provider}</p>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(provider.provider);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                title="Copy address"
              >
                {copied ? <span className="text-xs text-green-500">Copied!</span> : <Copy className="h-3.5 w-3.5" />}
              </button>
              <a
                href={`https://lava.explorers.guru/account/${provider.provider}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                title="View in explorer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Pie chart + cards grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[350px_1fr] gap-4">
        <Card>
          <CardHeader className="items-center pb-0">
            <CardTitle className="text-sm">Relays per Spec</CardTitle>
          </CardHeader>
          <CardContent className="pb-2">
            {pieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={90}
                      label={({ percent = 0 }: { percent?: number }) => percent >= 0.03 ? `${(percent * 100).toFixed(1)}%` : ""}
                      labelLine={false}
                      fontSize={11}
                      fill="#fff"
                    >
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.[0]) return null;
                        const d = payload[0].payload as { name: string; value: number; pct: number };
                        return (
                          <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-xl text-sm">
                            <div className="flex items-center gap-2 font-medium text-foreground mb-1">
                              <img src={getChainIcon(d.name)} alt="" className="w-4 h-4 rounded-sm" onError={(e) => (e.currentTarget.style.display = "none")} />
                              {d.name}
                            </div>
                            <div className="text-muted-foreground">
                              {d.value.toLocaleString()} relays
                              <span className="ml-1.5 text-foreground font-medium">({d.pct.toFixed(1)}%)</span>
                            </div>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 px-2">
                  {pieData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      {d.name}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-[250px] text-muted-foreground">
                <BarChart3 className="h-10 w-10 mb-3 opacity-20" />
                <span className="text-sm">No relay data available</span>
                <span className="text-xs opacity-60 mt-1">Requires indexer connection</span>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard label="Relays (30d)" value={formatNumberKMB(relays30d.toString())} fullValue={relays30d.toLocaleString()} icon={<ArrowUpNarrowWide className="h-4 w-4 text-muted-foreground" />} />
          <StatCard label="CU (30d)" value={formatNumberKMB(cu30d.toString())} fullValue={cu30d.toLocaleString()} icon={<MonitorCog className="h-4 w-4 text-muted-foreground" />} />
          <StatCard label="Total Stake" value={<LavaAmount amount={(totalStake + totalDelegation).toString()} />} icon={<Coins className="h-4 w-4 text-muted-foreground" />} />
          <StatCard label="Self Stake" value={<LavaAmount amount={totalStake.toString()} />} icon={<Coins className="h-4 w-4 text-muted-foreground" />} />
          <StatCard label="Delegation" value={<LavaAmount amount={totalDelegation.toString()} />} icon={<Coins className="h-4 w-4 text-muted-foreground" />} />
          {commissionDisplay && (
            <StatCard label="Commission" value={commissionDisplay} icon={<Percent className="h-4 w-4 text-muted-foreground" />} />
          )}
          {claimableRewards && (
            <StatCard label="Claimable Rewards" value={<LavaAmount amount={claimableRewards.amount} />} icon={<Award className="h-4 w-4 text-muted-foreground" />} />
          )}
        </div>
      </div>

      <div style={{ marginBottom: "20px" }} />

      {/* Optimizer Metrics — requires Relays DB, placeholder */}
      <Card className="border-dashed opacity-60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Consumer Optimizer Metrics</CardTitle>
          <CardDescription>Requires relay server data — coming soon</CardDescription>
        </CardHeader>
      </Card>

      <div style={{ marginBottom: "20px" }} />

      {/* Time-series Chart */}
      <ProviderChart data={providerChartData} isLoading={!useMockChart && !tsData} rangeDays={rangeDays} onRangeChange={setRangeDays} />

      <div style={{ marginBottom: "20px" }} />

      {/* Services (with inline health) */}
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <CardTitle>Services</CardTitle>
              {filteredStakes.length !== allStakes.length
                ? <span className="text-sm text-muted-foreground">{filteredStakes.length} of {allStakes.length}</span>
                : <span className="text-sm text-muted-foreground">{allStakes.length}</span>
              }
            </div>
          </div>

          <div className="flex gap-4 flex-wrap">
            {/* Status */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
              <div className="flex gap-1">
                {([
                  { key: "all" as const, label: "All", count: geoFiltered.length, dot: null, activeClass: "bg-muted text-foreground border-border" },
                  { key: "healthy" as const, label: "Healthy", count: geoFiltered.filter(s => s.health?.status === "healthy").length, dot: "bg-green-500", activeClass: "bg-green-500/10 text-green-400 border-green-500/30" },
                  { key: "unhealthy" as const, label: "Down", count: geoFiltered.filter(s => s.health?.status === "unhealthy").length, dot: "bg-red-500", activeClass: "bg-red-500/10 text-red-400 border-red-500/30" },
                ] as const).map((f) => (
                  <button key={f.key} onClick={() => setStakeFilter(f.key)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors duration-150 ${
                      stakeFilter === f.key
                        ? f.activeClass
                        : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
                    }`}>
                    {f.dot && <span className={`w-1.5 h-1.5 rounded-full ${f.dot}`} />}
                    {f.label}
                    <span className="text-[10px] opacity-50">{f.count}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Region */}
            {availableRegions.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Region</span>
                <div className="flex gap-1 flex-wrap">
                  <button onClick={() => setGeoFilter("all")}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors duration-150 ${
                      geoFilter === "all"
                        ? "bg-muted text-foreground border-border"
                        : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
                    }`}>
                    All
                    <span className="text-[10px] opacity-50">{healthFiltered.length}</span>
                  </button>
                  {availableRegions.map((region) => {
                    const count = healthFiltered.filter(s => geoLabel(s.geolocation).includes(region)).length;
                    return (
                      <button key={region} onClick={() => setGeoFilter(region)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors duration-150 ${
                          geoFilter === region
                            ? GEO_COLORS[region] ?? DEFAULT_GEO_COLOR
                            : "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
                        }`}>
                        {region}
                        <span className="text-[10px] opacity-50">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {(stakeFilter !== "all" || geoFilter !== "all") && (
              <div className="flex items-end pb-0.5">
                <button
                  onClick={() => { setStakeFilter("all"); setGeoFilter("all"); }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-accent/30 text-accent bg-accent/5 hover:bg-accent/15 transition-colors duration-150"
                >
                  &times; Reset
                </button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <SortableTable data={filteredStakes} columns={stakeCols} defaultSort={[{ id: "total", desc: true }]} renderSubRow={renderStakeSubRow} />
        </CardContent>
      </Card>

    </>
  );
}

