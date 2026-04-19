"use client";

import React, { use, useMemo, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { type ColumnDef, type Row } from "@tanstack/react-table";
import { useApi } from "@/hooks/use-api";
import { Loading } from "@/components/data/Loading";
import { StatCard } from "@/components/data/StatCard";
import { ProviderLink } from "@/components/data/ProviderLink";
import { LavaAmount } from "@/components/data/LavaAmount";
import { TimeTooltip } from "@/components/data/TimeTooltip";
import { SortableTable } from "@/components/data/SortableTable";

const ChainChart = dynamic(() => import("@/components/data/ChainChart").then((m) => m.ChainChart), { ssr: false });
const ChainOptimizerChart = dynamic(() => import("@/components/data/OptimizerMetricsChart").then((m) => m.ChainOptimizerChart), { ssr: false });
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { formatNumberKMB } from "@/lib/format";
import { Users, Coins, Box, Activity, BarChart3, ChevronRight } from "lucide-react";
import { useChainNames } from "@/hooks/use-chain-names";
import { getChainIcon } from "@/lib/chain-icons";
import { geoLabel } from "@info/shared";

function toBigInt(v: string | undefined): bigint {
  try { return BigInt(v ?? "0"); } catch { return 0n; }
}

// Badge color maps — same as provider page
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

interface SpecStake {
  provider: string;
  moniker: string;
  identity?: string;
  stake: string;
  delegation: string;
  geolocation: number;
  delegateCommission?: string;
  addons?: string;
  extensions?: string;
  cuSum30d?: string;
  relaySum30d?: string;
  health?: SpecHealth | null;
}

interface ChartSummary { chainId: string; cu: string; relays: string; }
interface TimeSeriesEntry {
  date: string; cu: string; relays: string;
  qosSync: number | null; qosAvailability: number | null; qosLatency: number | null;
}

/* ─── Mock chart data for dev (toggle via Dev Tools > Mock chart data) ─── */
function generateChainMockData(): TimeSeriesEntry[] {
  const points: TimeSeriesEntry[] = [];
  const now = new Date();
  let seed = 99;
  const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return seed / 2147483647; };
  for (let i = 90; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const relays = Math.round(250000 * (1 + Math.sin(i * 0.08) * 0.2) * (1 + (90 - i) * 0.004));
    const dip = i > 30 && i < 45 ? 0.05 : 0;
    points.push({
      date: date.toISOString().slice(0, 10), cu: String(relays * 6), relays: String(relays),
      qosSync: Math.min(1, Math.max(0, 0.997 - dip + (rand() - 0.5) * 0.005)),
      qosAvailability: Math.min(1, Math.max(0, 0.999 - dip * 0.4 + (rand() - 0.5) * 0.002)),
      qosLatency: Math.min(1, Math.max(0, 0.995 - dip + (rand() - 0.5) * 0.007)),
    });
  }
  return points;
}

export default function ChainPage({ params }: { params: Promise<{ specid: string }> }) {
  const { specid } = use(params);
  const { data: stakesResp, isLoading } = useApi<{ data: SpecStake[] }>(`/specs/${specid}/stakes`);
  const { data: summaryResp } = useApi<{ data: ChartSummary }>(`/specs/${specid}/charts`);
  const [rangeDays, setRangeDays] = useState(90);
  const chartFrom = rangeDays > 0 ? new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) : "";
  const { data: tsResp } = useApi<{ data: TimeSeriesEntry[] }>(`/specs/${specid}/charts${chartFrom ? `?from=${chartFrom}` : ""}`);
  const { getName } = useChainNames();

  const [useMockChart, setUseMockChart] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem("lava-mock-chart") === "true",
  );
  useEffect(() => {
    const handler = () => setUseMockChart(localStorage.getItem("lava-mock-chart") === "true");
    window.addEventListener("mock-chart-toggle", handler);
    return () => window.removeEventListener("mock-chart-toggle", handler);
  }, []);
  const chainChartData = useMemo(() => {
    if (useMockChart) {
      const mock = generateChainMockData();
      if (chartFrom) return mock.filter((p) => p.date >= chartFrom);
      return mock;
    }
    return tsResp?.data;
  }, [tsResp, useMockChart, chartFrom]);

  const [stakeFilter, setStakeFilter] = useState<"healthy" | "unhealthy" | "all">("all");
  const [geoFilter, setGeoFilter] = useState<string>("all");

  const stakes = useMemo(() => stakesResp?.data ?? [], [stakesResp]);
  const totalStake = useMemo(() => stakes.reduce((sum, s) => sum + toBigInt(s.stake), 0n), [stakes]);
  const cu30d = useMemo(() => stakes.reduce((sum, s) => sum + Number(s.cuSum30d ?? 0), 0), [stakes]);
  const relays30d = useMemo(() => stakes.reduce((sum, s) => sum + Number(s.relaySum30d ?? 0), 0), [stakes]);
  const totalDelegation = useMemo(() => stakes.reduce((sum, s) => sum + toBigInt(s.delegation), 0n), [stakes]);
  const healthyCnt = useMemo(() => stakes.filter(s => s.health?.status === "healthy").length, [stakes]);
  const unhealthyCnt = useMemo(() => stakes.filter(s => s.health?.status === "unhealthy").length, [stakes]);
  const notProbedCnt = useMemo(() => stakes.filter(s => !s.health).length, [stakes]);

  const availableRegions = useMemo(() => {
    const regions = new Set<string>();
    for (const s of stakes) {
      for (const r of geoLabel(s.geolocation).split(", ")) {
        if (r !== "—") regions.add(r);
      }
    }
    return Array.from(regions).sort();
  }, [stakes]);

  // Intermediate filtered sets for cross-filter counts
  const healthFiltered = useMemo(() => {
    if (stakeFilter === "all") return stakes;
    return stakes.filter(s => s.health?.status === stakeFilter);
  }, [stakes, stakeFilter]);

  const geoFiltered = useMemo(() => {
    if (geoFilter === "all") return stakes;
    return stakes.filter(s => geoLabel(s.geolocation).includes(geoFilter));
  }, [stakes, geoFilter]);

  const filteredStakes = useMemo(() => {
    if (geoFilter === "all") return healthFiltered;
    return healthFiltered.filter(s => geoLabel(s.geolocation).includes(geoFilter));
  }, [healthFiltered, geoFilter]);

  const stakeCols: ColumnDef<SpecStake, unknown>[] = useMemo(() => [
    {
      id: "provider", header: "Provider",
      accessorFn: (r) => r.moniker || r.provider,
      cell: ({ row }: { row: { original: SpecStake } }) => (
        <ProviderLink address={row.original.provider} moniker={row.original.moniker} identity={row.original.identity} showAvatar showAddress />
      ),
    },
    {
      id: "health", header: "Health",
      accessorFn: (r: SpecStake) => r.health?.status ?? "unknown",
      cell: ({ row }: { row: Row<SpecStake> }) => {
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
          <button type="button" onClick={() => row.toggleExpanded()} className="flex items-center gap-1.5 group cursor-pointer">
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
      },
    },
    { id: "total", header: "Total Stake", accessorFn: (r: SpecStake) => Number(toBigInt(r.stake) + toBigInt(r.delegation)), cell: ({ row }: { row: { original: SpecStake } }) => <LavaAmount amount={String(toBigInt(row.original.stake) + toBigInt(row.original.delegation))} /> },
    { id: "stake", header: "Self Stake", accessorFn: (r: SpecStake) => Number(toBigInt(r.stake)), cell: ({ row }: { row: { original: SpecStake } }) => <LavaAmount amount={row.original.stake} /> },
    { id: "delegation", header: "Delegation", accessorFn: (r: SpecStake) => Number(toBigInt(r.delegation)), cell: ({ row }: { row: { original: SpecStake } }) => <LavaAmount amount={row.original.delegation} /> },
    { id: "commission", header: "Commission", accessorFn: (r: SpecStake) => Number(r.delegateCommission || "0"), cell: ({ row }: { row: { original: SpecStake } }) => `${Number(row.original.delegateCommission || "0")}%` },
    { id: "cuSum30d", header: "CU (30d)", accessorFn: (r: SpecStake) => Number(toBigInt(r.cuSum30d)), cell: ({ row }: { row: { original: SpecStake } }) => row.original.cuSum30d != null ? formatNumberKMB(row.original.cuSum30d) : "—" },
    { id: "relaySum30d", header: "Relays (30d)", accessorFn: (r: SpecStake) => Number(toBigInt(r.relaySum30d)), cell: ({ row }: { row: { original: SpecStake } }) => row.original.relaySum30d != null ? formatNumberKMB(row.original.relaySum30d) : "—" },
    {
      id: "geolocation", header: "Location",
      accessorFn: (r) => r.geolocation,
      enableSorting: false,
      cell: ({ row }: { row: { original: SpecStake } }) => {
        const regions = geoLabel(row.original.geolocation);
        if (regions === "—") return "—";
        return (
          <div className="flex flex-wrap gap-1">
            {regions.split(", ").map((r) => (
              <span key={r} className={`px-2 py-0.5 rounded-full text-xs font-medium border ${GEO_COLORS[r] ?? DEFAULT_GEO_COLOR}`}>{r}</span>
            ))}
          </div>
        );
      },
    },
    {
      id: "addonsExtensions", header: "Addons/Extensions",
      enableSorting: false,
      accessorFn: (r: SpecStake) => `${r.addons || ""} ${r.extensions || ""}`.trim(),
      cell: ({ row }: { row: { original: SpecStake } }) => {
        const addons = (row.original.addons || "").split(",").filter(Boolean);
        const extensions = (row.original.extensions || "").split(",").filter(Boolean);
        if (addons.length === 0 && extensions.length === 0) return "—";
        return (
          <div className="flex flex-wrap gap-1">
            {addons.map((a) => <span key={`a-${a}`} className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/15 text-purple-400 border border-purple-500/30">{a.trim()}</span>)}
            {extensions.map((e) => <span key={`e-${e}`} className="px-2 py-0.5 rounded-full text-xs font-medium bg-violet-500/15 text-violet-300 border border-violet-500/30">{e.trim()}</span>)}
          </div>
        );
      },
    },
  ] as ColumnDef<SpecStake, unknown>[], []);

  const renderSubRow = (row: Row<SpecStake>) => {
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

  if (isLoading) return <Loading />;
  const chainName = getName(specid);

  return (
    <>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/chains"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded-md border border-border hover:bg-muted/50 transition-colors">
          &larr; Chains
        </Link>
        <div className="flex items-center gap-3">
          <img src={getChainIcon(specid)} alt="" className="w-8 h-8 rounded-md shrink-0" onError={(e) => (e.currentTarget.style.display = "none")} />
          <h1 className="text-2xl font-bold leading-tight">{chainName !== specid ? `${chainName} (${specid})` : specid}</h1>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 md:gap-8 xl:grid-cols-4">
        <StatCard label="Providers" icon={<Users className="h-4 w-4 text-muted-foreground" />} value={
          <div>
            <span>{stakes.length}</span>
            {stakes.length > 0 && (
              <>
                <div className="flex w-full h-1.5 rounded-full overflow-hidden mt-2 bg-muted">
                  {healthyCnt > 0 && <div className="bg-green-500 transition-all" style={{ width: `${healthyCnt / stakes.length * 100}%` }} />}
                  {unhealthyCnt > 0 && <div className="bg-red-500 transition-all" style={{ width: `${unhealthyCnt / stakes.length * 100}%` }} />}
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[11px] font-normal">
                  <span className="flex items-center gap-1 text-green-400"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />{healthyCnt} healthy</span>
                  {unhealthyCnt > 0 && <span className="flex items-center gap-1 text-red-400"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />{unhealthyCnt} down</span>}
                  {notProbedCnt > 0 && <span className="flex items-center gap-1 text-muted-foreground"><span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />{notProbedCnt} pending</span>}
                </div>
              </>
            )}
          </div>
        } />
        <StatCard label="CU (30d)" value={formatNumberKMB(cu30d)} icon={<Box className="h-4 w-4 text-muted-foreground" />} />
        <StatCard label="Relays (30d)" value={formatNumberKMB(relays30d)} icon={<Activity className="h-4 w-4 text-muted-foreground" />} />
        <StatCard label="Total Stake" value={<LavaAmount amount={totalStake.toString()} />} icon={<Coins className="h-4 w-4 text-muted-foreground" />} />
      </div>

      <div style={{ marginTop: "25px" }} />

      {/* Optimizer Metrics — from relays DB */}
      <ChainOptimizerChart specId={specid} providerInfo={stakesResp?.data} />

      <div style={{ marginTop: "25px" }} />

      {/* Time-series Chart */}
      <ChainChart data={chainChartData} isLoading={!useMockChart && !tsResp} rangeDays={rangeDays} onRangeChange={setRangeDays} />

      <div style={{ marginTop: "25px" }} />

      {/* Providers table */}
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <CardTitle>Providers</CardTitle>
              {filteredStakes.length !== stakes.length
                ? <span className="text-sm text-muted-foreground">{filteredStakes.length} of {stakes.length}</span>
                : <span className="text-sm text-muted-foreground">{stakes.length}</span>
              }
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-4 flex-wrap">
            {/* Health group */}
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

            {/* Region group */}
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

            {/* Clear */}
            {(stakeFilter !== "all" || geoFilter !== "all") && (
              <div className="flex items-end pb-0.5">
                <button
                  onClick={() => { setStakeFilter("all"); setGeoFilter("all"); }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-accent/30 text-accent bg-accent/5 hover:bg-accent/15 transition-colors"
                >
                  &times; Reset
                </button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <SortableTable data={filteredStakes} columns={stakeCols} defaultSort={[{ id: "total", desc: true }]} pageSize={20} renderSubRow={renderSubRow} />
        </CardContent>
      </Card>
    </>
  );
}
