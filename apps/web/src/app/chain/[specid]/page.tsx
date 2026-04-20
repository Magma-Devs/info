"use client";

import React, { use, useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { type ColumnDef, type Row } from "@tanstack/react-table";
import { useApi } from "@/hooks/use-api";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/data/StatCard";
import { ProviderLink } from "@/components/data/ProviderLink";
import { LavaAmount } from "@/components/data/LavaAmount";
import { TimeTooltip } from "@/components/data/TimeTooltip";
import { SortableTable } from "@/components/data/SortableTable";
import { ChainChart } from "@/components/data/ChainChart";
import { ChainOptimizerChart } from "@/components/data/OptimizerMetricsChart";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { formatNumberKMB, formatLava, formatLavaKMB } from "@/lib/format";
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
  const { data: stakesResp, isLoading: stakesLoading } = useApi<{ data: SpecStake[] }>(`/specs/${specid}/stakes`);
  const { data: summaryResp, isLoading: summaryLoading } = useApi<{ data: ChartSummary }>(`/specs/${specid}/charts`);
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
  const [expandedMobile, setExpandedMobile] = useState<Set<string>>(new Set());
  const toggleMobileExpand = (provider: string) => {
    setExpandedMobile((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  };

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

  // Mobile list: pre-sorted by total stake desc (desktop table has its own sort controls)
  const sortedFilteredStakes = useMemo(() => {
    return [...filteredStakes].sort((a, b) => {
      const av = toBigInt(a.stake) + toBigInt(a.delegation);
      const bv = toBigInt(b.stake) + toBigInt(b.delegation);
      return av > bv ? -1 : av < bv ? 1 : 0;
    });
  }, [filteredStakes]);

  const stakeCols: ColumnDef<SpecStake, unknown>[] = useMemo(() => [
    {
      id: "provider", header: "Provider",
      accessorFn: (r) => r.moniker || r.provider,
      cell: ({ row }: { row: { original: SpecStake } }) => (
        <div className="min-w-0 max-w-full">
          {/* Mobile: avatar + moniker only */}
          <div className="md:hidden">
            <ProviderLink address={row.original.provider} moniker={row.original.moniker} identity={row.original.identity} showAvatar />
          </div>
          {/* Desktop: avatar + moniker + full address */}
          <div className="hidden md:block">
            <ProviderLink address={row.original.provider} moniker={row.original.moniker} identity={row.original.identity} showAvatar showAddress />
          </div>
        </div>
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
            <ChevronRight size={12} className={`hidden md:inline-block text-muted-foreground transition-transform ${row.getIsExpanded() ? "rotate-90" : ""}`} />
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
    { id: "stake", header: "Self Stake", meta: { hideOnMobile: true }, accessorFn: (r: SpecStake) => Number(toBigInt(r.stake)), cell: ({ row }: { row: { original: SpecStake } }) => <LavaAmount amount={row.original.stake} /> },
    { id: "delegation", header: "Delegation Stake", meta: { hideOnMobile: true }, accessorFn: (r: SpecStake) => Number(toBigInt(r.delegation)), cell: ({ row }: { row: { original: SpecStake } }) => <LavaAmount amount={row.original.delegation} /> },
    { id: "commission", header: "Commission", meta: { hideOnMobile: true }, accessorFn: (r: SpecStake) => Number(r.delegateCommission || "0"), cell: ({ row }: { row: { original: SpecStake } }) => `${Number(row.original.delegateCommission || "0")}%` },
    { id: "cuSum30d", header: "CU (30d)", meta: { hideOnMobile: true }, accessorFn: (r: SpecStake) => Number(toBigInt(r.cuSum30d)), cell: ({ row }: { row: { original: SpecStake } }) => row.original.cuSum30d != null ? formatNumberKMB(row.original.cuSum30d) : "—" },
    { id: "relaySum30d", header: "Relays (30d)", meta: { hideOnMobile: true }, accessorFn: (r: SpecStake) => Number(toBigInt(r.relaySum30d)), cell: ({ row }: { row: { original: SpecStake } }) => row.original.relaySum30d != null ? formatNumberKMB(row.original.relaySum30d) : "—" },
    {
      id: "geolocation", header: "Location",
      accessorFn: (r) => r.geolocation,
      enableSorting: false,
      meta: { hideOnMobile: true },
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
      meta: { hideOnMobile: true },
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
    {
      id: "expand",
      header: "",
      enableSorting: false,
      meta: { mobileOnly: true },
      cell: ({ row }: { row: Row<SpecStake> }) => (
        <button type="button" onClick={() => row.toggleExpanded()} className="p-1 -m-1 text-muted-foreground" aria-label={row.getIsExpanded() ? "Collapse details" : "Expand details"}>
          <ChevronRight size={16} className={`transition-transform ${row.getIsExpanded() ? "rotate-90" : ""}`} />
        </button>
      ),
    },
  ] as ColumnDef<SpecStake, unknown>[], []);

  const renderStakeDetails = (s: SpecStake) => {
    const h = s.health;
    const addons = (s.addons || "").split(",").filter(Boolean);
    const extensions = (s.extensions || "").split(",").filter(Boolean);
    const regions = geoLabel(s.geolocation);
    const hasInterfaces = !!h?.interfaces?.length;

    return (
      <div className="space-y-4">
        {/* Mobile: stats grid — data that's hidden from the table on mobile */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 md:hidden">
          <div>
            <dt className="text-sm uppercase tracking-wider text-muted-foreground mb-1.5">Self Stake</dt>
            <dd className="text-base font-semibold"><LavaAmount amount={s.stake} /></dd>
          </div>
          <div>
            <dt className="text-sm uppercase tracking-wider text-muted-foreground mb-1.5">Delegation Stake</dt>
            <dd className="text-base font-semibold"><LavaAmount amount={s.delegation} /></dd>
          </div>
          <div>
            <dt className="text-sm uppercase tracking-wider text-muted-foreground mb-1.5">Commission</dt>
            <dd className="text-base font-semibold">{Number(s.delegateCommission || "0")}%</dd>
          </div>
          <div>
            <dt className="text-sm uppercase tracking-wider text-muted-foreground mb-1.5">Relays (30d)</dt>
            <dd className="text-base font-semibold">{s.relaySum30d != null ? formatNumberKMB(s.relaySum30d) : "—"}</dd>
          </div>
          <div>
            <dt className="text-sm uppercase tracking-wider text-muted-foreground mb-1.5">CU (30d)</dt>
            <dd className="text-base font-semibold">{s.cuSum30d != null ? formatNumberKMB(s.cuSum30d) : "—"}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-sm uppercase tracking-wider text-muted-foreground mb-2">Location</dt>
            <dd>
              {regions === "—" ? <span className="text-base text-muted-foreground">—</span> : (
                <div className="flex flex-wrap gap-2">
                  {regions.split(", ").map((r) => (
                    <span key={r} className={`px-3 py-1.5 rounded-full text-base font-medium border ${GEO_COLORS[r] ?? DEFAULT_GEO_COLOR}`}>{r}</span>
                  ))}
                </div>
              )}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-sm uppercase tracking-wider text-muted-foreground mb-2">Addons / Extensions</dt>
            <dd>
              {addons.length === 0 && extensions.length === 0 ? <span className="text-base text-muted-foreground">—</span> : (
                <div className="flex flex-wrap gap-2">
                  {addons.map((a) => <span key={`a-${a}`} className="px-3 py-1.5 rounded-full text-base font-medium bg-purple-500/15 text-purple-400 border border-purple-500/30">{a.trim()}</span>)}
                  {extensions.map((e) => <span key={`e-${e}`} className="px-3 py-1.5 rounded-full text-base font-medium bg-violet-500/15 text-violet-300 border border-violet-500/30">{e.trim()}</span>)}
                </div>
              )}
            </dd>
          </div>
        </dl>

        {/* Health interfaces — both mobile and desktop */}
        {hasInterfaces && (
          <>
            <div className="md:hidden border-t border-border/50 -mx-4 my-3" />
            {/* Mobile: stacked interface cards */}
            <div className="md:hidden space-y-3">
              <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Interfaces</div>
              {h!.interfaces.map((iface, idx) => {
                const isHealthy = iface.status === "healthy";
                const ifaceColor = INTERFACE_COLORS[iface.name.toLowerCase()] ?? DEFAULT_IFACE_COLOR;
                const geoStr = geoLabel(Number(iface.geolocation));
                const geoColor = GEO_COLORS[geoStr] ?? DEFAULT_GEO_COLOR;
                const key = `m-${iface.name}-${iface.geolocation}-${idx}`;
                return (
                  <div key={key} className="rounded-lg border border-border/50 p-4 text-base space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-3 py-1.5 rounded-full text-base font-medium border ${ifaceColor}`}>{iface.name}</span>
                      <span className={`px-3 py-1.5 rounded-full text-base font-medium border ${geoColor}`}>{geoStr}</span>
                      <span className="flex items-center gap-1.5 ml-auto">
                        <span className={`w-2.5 h-2.5 rounded-full ${isHealthy ? "bg-green-500" : "bg-red-500"}`} />
                        <span className={`text-base font-medium ${isHealthy ? "text-green-400" : "text-red-400"}`}>{iface.status}</span>
                      </span>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>{isHealthy && iface.latencyMs != null ? `${iface.latencyMs}ms` : ""}</span>
                      <span className="font-mono">{isHealthy && iface.block != null ? iface.block.toLocaleString() : ""}</span>
                      <TimeTooltip datetime={iface.timestamp} />
                    </div>
                    {!isHealthy && iface.message && (
                      <div className="text-red-400/70 text-sm break-words" title={iface.message}>{iface.message}</div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop: original grid layout */}
            <div className="hidden md:grid grid-cols-[100px_90px_90px_70px_110px_1fr] gap-x-4 gap-y-2 text-xs items-center">
              <span className="text-muted-foreground font-medium">Interface</span>
              <span className="text-muted-foreground font-medium">Region</span>
              <span className="text-muted-foreground font-medium">Status</span>
              <span className="text-muted-foreground font-medium">Latency</span>
              <span className="text-muted-foreground font-medium">Block</span>
              <span className="text-muted-foreground font-medium text-right">Last checked</span>
              {h!.interfaces.map((iface, idx) => {
                const isHealthy = iface.status === "healthy";
                const ifaceColor = INTERFACE_COLORS[iface.name.toLowerCase()] ?? DEFAULT_IFACE_COLOR;
                const geoStr = geoLabel(Number(iface.geolocation));
                const geoColor = GEO_COLORS[geoStr] ?? DEFAULT_GEO_COLOR;
                const key = `${iface.name}-${iface.geolocation}-${idx}`;
                return (
                  <React.Fragment key={key}>
                    <span className={`px-2 py-0.5 rounded-full font-medium border text-center ${ifaceColor}`}>{iface.name}</span>
                    <span className={`px-2 py-0.5 rounded-full font-medium border text-center truncate ${geoColor}`} title={geoStr}>{geoStr}</span>
                    <span className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${isHealthy ? "bg-green-500" : "bg-red-500"}`} />
                      <span className={`font-medium ${isHealthy ? "text-green-400" : "text-red-400"}`}>{iface.status}</span>
                    </span>
                    <span className="text-muted-foreground">{isHealthy && iface.latencyMs != null ? `${iface.latencyMs}ms` : "—"}</span>
                    <span className="text-muted-foreground font-mono">
                      {isHealthy && iface.block != null ? iface.block.toLocaleString() : !isHealthy && iface.message ? <span className="text-red-400/70 truncate block max-w-[200px] font-sans" title={iface.message}>{iface.message}</span> : "—"}
                    </span>
                    <span className="text-right"><TimeTooltip datetime={iface.timestamp} /></span>
                  </React.Fragment>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  };

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

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 md:gap-8 xl:grid-cols-6">
        <StatCard label="Providers" icon={<Users className="h-4 w-4 text-muted-foreground" />} loading={stakesLoading} value={
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

        {/* Mobile: consolidated Relays (total + 30d) */}
        <StatCard
          className="md:hidden"
          label="Relays"
          icon={<Activity className="h-4 w-4 text-muted-foreground" />}
          loading={summaryLoading || stakesLoading}
          value={
            <div>
              <div>{summaryResp?.data?.relays != null ? formatNumberKMB(summaryResp.data.relays) : "—"}</div>
              <div className="text-xs text-muted-foreground font-normal mt-1">{formatNumberKMB(relays30d)} in 30d</div>
            </div>
          }
        />
        {/* Mobile: consolidated CU (total + 30d) */}
        <StatCard
          className="md:hidden"
          label="CU"
          icon={<Box className="h-4 w-4 text-muted-foreground" />}
          loading={summaryLoading || stakesLoading}
          value={
            <div>
              <div>{summaryResp?.data?.cu != null ? formatNumberKMB(summaryResp.data.cu) : "—"}</div>
              <div className="text-xs text-muted-foreground font-normal mt-1">{formatNumberKMB(cu30d)} in 30d</div>
            </div>
          }
        />

        {/* Desktop: split — Total Relays, Total CU, Relays (30d), CU (30d) */}
        <StatCard
          className="hidden md:block"
          label="Total Relays"
          loading={summaryLoading}
          value={summaryResp?.data?.relays != null ? formatNumberKMB(summaryResp.data.relays) : "—"}
          fullValue={summaryResp?.data?.relays != null ? Number(summaryResp.data.relays).toLocaleString() : undefined}
          icon={<Activity className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          className="hidden md:block"
          label="Total CU"
          loading={summaryLoading}
          value={summaryResp?.data?.cu != null ? formatNumberKMB(summaryResp.data.cu) : "—"}
          fullValue={summaryResp?.data?.cu != null ? Number(summaryResp.data.cu).toLocaleString() : undefined}
          icon={<Box className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard className="hidden md:block" label="Relays (30d)" loading={stakesLoading} value={formatNumberKMB(relays30d)} icon={<Activity className="h-4 w-4 text-muted-foreground" />} />
        <StatCard className="hidden md:block" label="CU (30d)" loading={stakesLoading} value={formatNumberKMB(cu30d)} icon={<Box className="h-4 w-4 text-muted-foreground" />} />

        <StatCard
          label="Total Stake"
          loading={stakesLoading}
          value={`${formatLavaKMB(totalStake.toString())} LAVA`}
          fullValue={`${formatLava(totalStake.toString())} LAVA`}
          icon={<Coins className="h-4 w-4 text-muted-foreground" />}
        />
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
          <div className="flex flex-col gap-3 md:flex-row md:gap-4 md:flex-wrap">
            {/* Status group */}
            <div className="space-y-1.5 md:flex-none">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
              {/* Mobile: full-width segmented control */}
              <div className="flex md:hidden gap-1 rounded-md border border-border/60 p-0.5 bg-muted/20">
                {([
                  { key: "all" as const, label: "All", dot: null, activeClass: "bg-muted text-foreground" },
                  { key: "healthy" as const, label: "Healthy", dot: "bg-green-500", activeClass: "bg-green-500/15 text-green-400" },
                  { key: "unhealthy" as const, label: "Down", dot: "bg-red-500", activeClass: "bg-red-500/15 text-red-400" },
                ] as const).map((f) => (
                  <button key={f.key} onClick={() => setStakeFilter(f.key)}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded transition-colors duration-150 ${
                      stakeFilter === f.key ? f.activeClass : "text-muted-foreground"
                    }`}>
                    {f.dot && <span className={`w-1.5 h-1.5 rounded-full ${f.dot}`} />}
                    {f.label}
                  </button>
                ))}
              </div>
              {/* Desktop: chip pills */}
              <div className="hidden md:flex gap-1">
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
                {/* Mobile: native select */}
                <select
                  value={geoFilter}
                  onChange={(e) => setGeoFilter(e.target.value)}
                  className="md:hidden w-full h-11 rounded-md border border-border bg-card px-3 text-sm text-foreground"
                >
                  <option value="all">All regions ({healthFiltered.length})</option>
                  {availableRegions.map((region) => {
                    const count = healthFiltered.filter(s => geoLabel(s.geolocation).includes(region)).length;
                    return <option key={region} value={region}>{region} ({count})</option>;
                  })}
                </select>
                {/* Desktop: chip pills */}
                <div className="hidden md:flex gap-1 flex-wrap">
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
              <div className="md:flex md:items-end md:pb-0.5">
                <button
                  onClick={() => { setStakeFilter("all"); setGeoFilter("all"); }}
                  className="w-full md:w-auto inline-flex items-center justify-center gap-1 px-3 py-2 md:py-1 text-sm md:text-xs font-medium rounded-md border border-accent/30 text-accent bg-accent/5 hover:bg-accent/15 transition-colors"
                >
                  &times; Reset
                </button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0 md:p-6 md:pt-0">
          {/* Mobile: card list */}
          <ul className="md:hidden divide-y divide-border/30">
            {stakesLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <li key={`skel-${i}`} className="flex items-center gap-3 px-4 py-4">
                  <Skeleton className="w-9 h-9 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-4 w-20 shrink-0" />
                </li>
              ))
            ) : sortedFilteredStakes.length === 0 ? (
              <li className="py-12 text-center text-sm text-muted-foreground">No providers match the current filters</li>
            ) : (
              sortedFilteredStakes.map((s) => {
                const h = s.health;
                const isHealthy = h?.status === "healthy";
                const isExpanded = expandedMobile.has(s.provider);
                const total = toBigInt(s.stake) + toBigInt(s.delegation);
                const label = s.moniker || `${s.provider.slice(0, 12)}...`;
                return (
                  <li key={s.provider}>
                    <button
                      type="button"
                      onClick={() => toggleMobileExpand(s.provider)}
                      className="w-full flex items-center gap-3 px-4 py-4 text-left active:bg-muted/40 transition-colors"
                    >
                      <ProviderAvatarImg address={s.provider} moniker={s.moniker} identity={s.identity} />
                      <div className="min-w-0 flex-1">
                        <div className="text-base font-medium truncate">{label}</div>
                        {s.moniker && (
                          <div className="text-[11px] text-muted-foreground font-mono truncate">{s.provider}</div>
                        )}
                        <div className="flex items-center gap-1.5 mt-1">
                          {h ? (
                            <>
                              <span className={`w-1.5 h-1.5 rounded-full ${isHealthy ? "bg-green-500" : "bg-red-500"}`} />
                              <span className={`text-xs font-medium ${isHealthy ? "text-green-400" : "text-red-400"}`}>
                                {isHealthy ? "Healthy" : `${h.unhealthy}/${h.total} Down`}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                              <span className="text-xs text-muted-foreground">No data</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Stake</div>
                        <div className="text-sm font-semibold mt-0.5"><LavaAmount amount={total.toString()} /></div>
                      </div>
                      <ChevronRight size={18} className={`text-muted-foreground transition-transform shrink-0 ${isExpanded ? "rotate-90" : ""}`} />
                    </button>
                    {isExpanded && (
                      <div className="bg-muted/15 px-4 py-4">
                        {renderStakeDetails(s)}
                      </div>
                    )}
                  </li>
                );
              })
            )}
          </ul>
          {/* Desktop: sortable table */}
          <div className="hidden md:block">
            <SortableTable data={filteredStakes} columns={stakeCols} defaultSort={[{ id: "total", desc: true }]} renderSubRow={(row) => renderStakeDetails(row.original)} loading={stakesLoading} />
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function ProviderAvatarImg({ address, moniker, identity }: { address: string; moniker?: string; identity?: string }) {
  const avatarUrl = identity ? `/providers/${address}/avatar?identity=${identity}` : null;
  const { data: avatarResp } = useApi<{ url: string | null }>(avatarUrl);
  if (avatarResp?.url) {
    return <img src={avatarResp.url} alt="" className="w-9 h-9 rounded-full shrink-0" loading="lazy" />;
  }
  return (
    <span className="w-9 h-9 rounded-full shrink-0 bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground">
      {(moniker || address).charAt(0).toUpperCase()}
    </span>
  );
}
