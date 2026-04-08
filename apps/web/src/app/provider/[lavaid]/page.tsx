"use client";

import { use, useState, useMemo } from "react";
import Link from "next/link";
import { useApi } from "@/hooks/use-api";
import { Loading } from "@/components/data/Loading";
import { StatCard } from "@/components/data/StatCard";
import { ChainLink } from "@/components/data/ChainLink";
import { getChainIcon } from "@/lib/chain-icons";
import { ProviderLink } from "@/components/data/ProviderLink";
import { LavaAmount } from "@/components/data/LavaAmount";
import { TimeTooltip } from "@/components/data/TimeTooltip";
import { Chart } from "@/components/data/Chart";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { SortableTable } from "@/components/data/SortableTable";
import { type ColumnDef, type Row } from "@tanstack/react-table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatNumber, formatNumberKMB, formatLava } from "@/lib/format";
import { downloadCsv } from "@/lib/csv";
import { Coins, MonitorCog, ArrowUpNarrowWide, Award, BarChart3, Percent, Copy, ExternalLink, Download, ChevronRight } from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";

const COLORS = ["#ac4c39", "#ab5a49", "#e07a5f", "#f2cc8f", "#81b29a", "#3d405b", "#f4f1de", "#e8a87c"];

function geoLabel(geo?: number): string {
  if (geo == null || geo === 0) return "—";
  if (geo === 0xffff) return "Global";
  const regions: string[] = [];
  if (geo & 0x1) regions.push("US-Center");
  if (geo & 0x2) regions.push("Europe");
  if (geo & 0x4) regions.push("US-East");
  if (geo & 0x8) regions.push("US-West");
  if (geo & 0x10) regions.push("Africa");
  if (geo & 0x20) regions.push("Asia");
  if (geo & 0x40) regions.push("AU/NZ");
  return regions.length > 0 ? regions.join(", ") : String(geo);
}

interface InterfaceHealth {
  name: string;
  status: string;
  latencyMs: number | null;
  block: number | null;
  message: string | null;
  timestamp: string;
}

interface SpecHealth {
  status: "healthy" | "unhealthy";
  total: number;
  unhealthy: number;
  oldestTimestamp: string;
  interfaces: InterfaceHealth[];
}

interface ProviderDetail {
  provider: string;
  moniker: string;
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

interface ReportRow {
  id: string; provider: string; chainId: string; errors: number; disconnections: number;
  epoch: string; blockHeight: string; timestamp: string;
}

interface EventRow {
  id: string; eventType: string; provider: string; specId: string;
  amount: string; blockHeight: string; timestamp: string; data: string;
}

interface BlockReportRow {
  id: string; provider: string; chainId: string; chainBlockHeight: string;
  blockHeight: string; timestamp: string;
}

interface DelegatorReward {
  denom: string; amount: string;
}

export default function ProviderPage({ params }: { params: Promise<{ lavaid: string }> }) {
  const { lavaid } = use(params);
  const { data: provider, isLoading } = useApi<ProviderDetail>(`/providers/${lavaid}`);
  const { data: rewards } = useApi<{ data: ChartEntry[] }>(`/providers/${lavaid}/charts`);
  const [rangeDays, setRangeDays] = useState(90);
  const chartFrom = rangeDays > 0 ? new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) : "";
  const { data: tsData } = useApi<{ data: TimeSeriesEntry[] }>(`/providers/${lavaid}/charts${chartFrom ? `?from=${chartFrom}` : ""}`);
  const { data: reports } = useApi<{ data: ReportRow[]; pagination: { total: number } }>(`/providers/${lavaid}/reports?limit=20`);
  const { data: events } = useApi<{ data: EventRow[]; pagination: { total: number } }>(`/providers/${lavaid}/events?limit=20`);
  const { data: blockReports } = useApi<{ data: BlockReportRow[]; pagination: { total: number } }>(`/providers/${lavaid}/block-reports?limit=20`);
  const { data: delegatorRewards } = useApi<{ data: DelegatorReward[] }>(`/providers/${lavaid}/delegator-rewards`);
  const { data: avatarResp } = useApi<{ url: string | null }>(`/providers/${lavaid}/avatar`);

  const [chartChain, setChartChain] = useState<string>("all");
  const [copied, setCopied] = useState(false);
  const [stakeFilter, setStakeFilter] = useState<"active" | "all">("active");

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

  // Build time-series chart data
  const chartData = useMemo(() => {
    if (!tsData?.data) return [];
    const byDay = new Map<string, { date: string; relays: number; cu: number; qS: number; qA: number; qL: number; w: number }>();
    for (const p of tsData.data) {
      if (chartChain !== "all" && p.chainId !== chartChain) continue;
      const existing = byDay.get(p.date);
      const relays = Number(p.relays);
      if (existing) {
        existing.relays += relays;
        existing.cu += Number(p.cu);
        if (p.qosSync != null) { existing.qS += p.qosSync * relays; existing.qA += (p.qosAvailability ?? 0) * relays; existing.qL += (p.qosLatency ?? 0) * relays; existing.w += relays; }
      } else {
        byDay.set(p.date, { date: p.date, relays, cu: Number(p.cu), qS: (p.qosSync ?? 0) * relays, qA: (p.qosAvailability ?? 0) * relays, qL: (p.qosLatency ?? 0) * relays, w: p.qosSync != null ? relays : 0 });
      }
    }
    return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({
      date: d.date, relays: d.relays, cu: d.cu,
      qosSync: d.w > 0 ? d.qS / d.w : null, qosAvailability: d.w > 0 ? d.qA / d.w : null, qosLatency: d.w > 0 ? d.qL / d.w : null,
    }));
  }, [tsData, chartChain]);

  const chainOptions = useMemo(() => {
    if (!tsData?.data) return [];
    return [...new Set(tsData.data.map((p) => p.chainId))].sort();
  }, [tsData]);

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
    { id: "stake", header: "Self Stake", accessorFn: (r: Stake) => Number(BigInt(r.stake || "0")), cell: ({ row }: { row: { original: Stake } }) => <LavaAmount amount={row.original.stake} /> },
    { id: "delegation", header: "Delegation", accessorFn: (r: Stake) => Number(BigInt(r.delegation || "0")), cell: ({ row }: { row: { original: Stake } }) => <LavaAmount amount={row.original.delegation} /> },
    { id: "commission", header: "Commission", accessorFn: (r: Stake) => Number(r.delegateCommission || "0"), cell: ({ row }: { row: { original: Stake } }) => `${Number(row.original.delegateCommission || "0")}%` },
    { id: "geolocation", header: "Location", accessorFn: (r: Stake) => r.geolocation ?? 0, cell: ({ row }: { row: { original: Stake } }) => {
      const regions = geoLabel(row.original.geolocation);
      if (regions === "—") return "—";
      return <div className="flex flex-wrap gap-1">{regions.split(", ").map((r) => <span key={r} className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30">{r}</span>)}</div>;
    }},
    { id: "addonsExtensions", header: "Addons/Extensions", accessorFn: (r: Stake) => `${r.addons || ""} ${r.extensions || ""}`.trim(), cell: ({ row }: { row: { original: Stake } }) => {
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
      <div className="grid gap-2">
        {h.interfaces.map((iface) => {
          const isHealthy = iface.status === "healthy";
          return (
            <div key={iface.name} className="flex items-center gap-3 text-xs">
              <span className="px-2 py-0.5 rounded-full font-medium bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 min-w-[70px] text-center">
                {iface.name}
              </span>
              <span className={`w-1.5 h-1.5 rounded-full ${isHealthy ? "bg-green-500" : "bg-red-500"}`} />
              <span className={`font-medium ${isHealthy ? "text-green-400" : "text-red-400"}`}>
                {iface.status}
              </span>
              {isHealthy && iface.latencyMs != null && (
                <span className="text-muted-foreground">{iface.latencyMs}ms</span>
              )}
              {isHealthy && iface.block != null && (
                <span className="text-muted-foreground">blk {formatNumber(iface.block)}</span>
              )}
              {!isHealthy && iface.message && (
                <span className="text-red-400/70 truncate max-w-[300px]">{iface.message}</span>
              )}
              <span className="text-muted-foreground ml-auto">
                <TimeTooltip datetime={iface.timestamp} />
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const reportCols: ColumnDef<ReportRow, unknown>[] = useMemo(() => [
    { id: "chainId", header: "Chain", accessorFn: (r: ReportRow) => r.chainId, cell: ({ row }: { row: { original: ReportRow } }) => <ChainLink chainId={row.original.chainId} /> },
    { id: "errors", header: "Errors", accessorFn: (r: ReportRow) => r.errors },
    { id: "disconnections", header: "Disconnections", accessorFn: (r: ReportRow) => r.disconnections },
    { id: "epoch", header: "Epoch", accessorFn: (r: ReportRow) => r.epoch, cell: ({ row }: { row: { original: ReportRow } }) => <span className="text-muted-foreground">{row.original.epoch}</span> },
    { id: "timestamp", header: "Time", accessorFn: (r: ReportRow) => r.timestamp, cell: ({ row }: { row: { original: ReportRow } }) => row.original.timestamp ? <TimeTooltip datetime={row.original.timestamp} /> : "—" },
  ] as ColumnDef<ReportRow, unknown>[], []);

  const eventCols: ColumnDef<EventRow, unknown>[] = useMemo(() => [
    { id: "blockHeight", header: "Block", accessorFn: (r: EventRow) => Number(r.blockHeight), cell: ({ row }: { row: { original: EventRow } }) => <span className="text-xs">{row.original.blockHeight}</span> },
    { id: "eventType", header: "Type", accessorFn: (r: EventRow) => r.eventType, cell: ({ row }: { row: { original: EventRow } }) => <span className="text-xs">{row.original.eventType}</span> },
    { id: "specId", header: "Chain", accessorFn: (r: EventRow) => r.specId, cell: ({ row }: { row: { original: EventRow } }) => row.original.specId ? <ChainLink chainId={row.original.specId} /> : "—" },
    { id: "timestamp", header: "Time", accessorFn: (r: EventRow) => r.timestamp, cell: ({ row }: { row: { original: EventRow } }) => row.original.timestamp ? <TimeTooltip datetime={row.original.timestamp} /> : "—" },
  ] as ColumnDef<EventRow, unknown>[], []);

  const blockReportCols: ColumnDef<BlockReportRow, unknown>[] = useMemo(() => [
    { id: "chainId", header: "Chain", accessorFn: (r: BlockReportRow) => r.chainId, cell: ({ row }: { row: { original: BlockReportRow } }) => <ChainLink chainId={row.original.chainId} /> },
    { id: "chainBlockHeight", header: "Chain Block Height", accessorFn: (r: BlockReportRow) => Number(r.chainBlockHeight), cell: ({ row }: { row: { original: BlockReportRow } }) => formatNumber(row.original.chainBlockHeight) },
    { id: "blockHeight", header: "Lava Block", accessorFn: (r: BlockReportRow) => Number(r.blockHeight), cell: ({ row }: { row: { original: BlockReportRow } }) => formatNumber(row.original.blockHeight) },
    { id: "timestamp", header: "Time", accessorFn: (r: BlockReportRow) => r.timestamp, cell: ({ row }: { row: { original: BlockReportRow } }) => row.original.timestamp ? <TimeTooltip datetime={row.original.timestamp} /> : "—" },
  ] as ColumnDef<BlockReportRow, unknown>[], []);

  const filteredStakes = useMemo(() => {
    if (!provider) return [];
    return stakeFilter === "active"
      ? provider.stakes.filter(s => !s.status || s.status === "active" || s.status === "Active")
      : provider.stakes;
  }, [provider, stakeFilter]);

  if (isLoading) return <Loading />;

  if (!provider) {
    return (
      <>
        <Link href="/providers" className="orangelinks text-sm">&larr; Back to Providers</Link>
        <h1 className="text-2xl font-bold mt-4 mb-4">Provider Not Found</h1>
        <p className="text-muted-foreground">No data available for provider: {lavaid}</p>
      </>
    );
  }

  const claimableRewards = delegatorRewards?.data?.find((r) => r.denom === "ulava");

  return (
    <>
      <Link href="/providers" className="orangelinks text-sm">&larr; Back to Providers</Link>
      <div style={{ marginBottom: "5px" }} />

      {/* Moniker + address header */}
      <div style={{ marginLeft: "23px" }} className="flex items-center gap-3">
        {avatarResp?.url && (
          <img src={avatarResp.url} alt="" className="w-10 h-10 rounded-full" />
        )}
        <div>
          <h1 className="text-3xl font-bold mb-1">{provider.moniker || "Unknown Provider"}</h1>
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground font-mono">{provider.provider}</p>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(provider.provider);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Copy address"
            >
              {copied ? <span className="text-xs text-green-500">Copied!</span> : <Copy className="h-4 w-4" />}
            </button>
            <a
              href={`https://lava.explorers.guru/account/${provider.provider}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="View in explorer"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>

      <div style={{ marginTop: "15px" }} />

      {/* Pie chart + cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-[350px_1fr] gap-4">
        {pieData.length > 0 && (
          <Card>
            <CardHeader className="items-center pb-0">
              <CardTitle className="text-sm">Relays per Spec</CardTitle>
            </CardHeader>
            <CardContent className="pb-2">
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
                    label={({ pct }: { pct: number }) => pct >= 3 ? `${pct.toFixed(1)}%` : ""}
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
              {/* Legend */}
              <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5 px-2">
                {pieData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    {d.name}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1"><StatCard label="Relays (30d)" value={formatNumberKMB(relays30d.toString())} icon={<ArrowUpNarrowWide className="h-4 w-4 text-muted-foreground" />} /></div>
            <div className="flex-1"><StatCard label="CU (30d)" value={formatNumberKMB(cu30d.toString())} icon={<MonitorCog className="h-4 w-4 text-muted-foreground" />} /></div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1"><StatCard label="Total Stake" value={<LavaAmount amount={(totalStake + totalDelegation).toString()} />} icon={<Coins className="h-4 w-4 text-muted-foreground" />} /></div>
            <div className="flex-1"><StatCard label="Self Stake" value={<LavaAmount amount={totalStake.toString()} />} icon={<Coins className="h-4 w-4 text-muted-foreground" />} /></div>
            <div className="flex-1"><StatCard label="Delegation" value={<LavaAmount amount={totalDelegation.toString()} />} icon={<Coins className="h-4 w-4 text-muted-foreground" />} /></div>
            {commissionDisplay && (
              <div className="flex-1"><StatCard label="Commission" value={commissionDisplay} icon={<Percent className="h-4 w-4 text-muted-foreground" />} /></div>
            )}
            {claimableRewards && (
              <div className="flex-1"><StatCard label="Claimable Rewards" value={<LavaAmount amount={claimableRewards.amount} />} icon={<Award className="h-4 w-4 text-muted-foreground" />} /></div>
            )}
          </div>
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
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Relays &amp; QoS</CardTitle>
            <CardDescription>Daily performance</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {[{ label: "30d", days: 30 }, { label: "90d", days: 90 }, { label: "1y", days: 365 }, { label: "All", days: 0 }].map((r) => (
                <button key={r.label} onClick={() => setRangeDays(r.days)}
                  className={`px-2 py-1 text-xs rounded ${rangeDays === r.days ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted border border-border"}`}>
                  {r.label}
                </button>
              ))}
            </div>
            <select
              value={chartChain}
              onChange={(e) => setChartChain(e.target.value)}
              className="bg-card border border-border rounded px-3 py-1.5 text-sm text-foreground"
            >
              <option value="all">All Chains</option>
              {chainOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <Chart
            data={chartData}
            series={[
              { key: "relays", label: "Relays", color: "#ac4c39", type: "area" },
              { key: "qosSync", label: "QoS Sync", color: "#81b29a" },
              { key: "qosAvailability", label: "QoS Availability", color: "#f2cc8f" },
              { key: "qosLatency", label: "QoS Latency", color: "#3d405b" },
            ]}
            xKey="date"
            height={350}
            isLoading={!tsData}
            brushable
            toggleable
          />
        </CardContent>
      </Card>

      <div style={{ marginBottom: "20px" }} />

      {/* Services (with inline health) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Services</CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              <button onClick={() => setStakeFilter("active")}
                className={`px-2 py-1 text-xs rounded ${stakeFilter === "active" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted border border-border"}`}>
                Active ({provider.stakes.filter(s => !s.status || s.status === "active" || s.status === "Active").length})
              </button>
              <button onClick={() => setStakeFilter("all")}
                className={`px-2 py-1 text-xs rounded ${stakeFilter === "all" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted border border-border"}`}>
                All ({provider.stakes.length})
              </button>
            </div>
            <button onClick={() => downloadCsv(provider.stakes.map(s => ({ chain: s.specId, stake: s.stake, delegation: s.delegation, commission: s.delegateCommission ?? "", geolocation: s.geolocation ?? "", addons: s.addons ?? "", extensions: s.extensions ?? "" })), `provider-${lavaid}-stakes.csv`)}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <Download size={14} /> CSV
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <SortableTable data={filteredStakes} columns={stakeCols} defaultSort={[{ id: "total", desc: true }]} renderSubRow={renderStakeSubRow} />
        </CardContent>
      </Card>

      <div style={{ marginBottom: "5px" }} />

      <CardHeader>
        <CardTitle>Full Provider Details</CardTitle>
        <CardDescription>Comprehensive information about the provider&apos;s performance and metrics</CardDescription>
      </CardHeader>

      <div style={{ marginBottom: "5px" }} />

      {/* Tabs: Reports / Events / Block Reports */}
      <Card>
        <Tabs defaultValue="reports">
          <CardHeader>
            <TabsList>
              <TabsTrigger value="reports">Reports ({reports?.pagination?.total ?? 0})</TabsTrigger>
              <TabsTrigger value="events">Events ({events?.pagination?.total ?? 0})</TabsTrigger>
              <TabsTrigger value="block-reports">Block Reports ({blockReports?.pagination?.total ?? 0})</TabsTrigger>
            </TabsList>
          </CardHeader>

          <TabsContent value="reports">
            <CardContent className="p-0">
              <SortableTable data={reports?.data ?? []} columns={reportCols} />
            </CardContent>
          </TabsContent>

          <TabsContent value="events">
            <CardContent className="p-0">
              <SortableTable data={events?.data ?? []} columns={eventCols} />
            </CardContent>
          </TabsContent>

          <TabsContent value="block-reports">
            <CardContent className="p-0">
              <SortableTable data={blockReports?.data ?? []} columns={blockReportCols} />
            </CardContent>
          </TabsContent>
        </Tabs>
      </Card>
    </>
  );
}

