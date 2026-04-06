"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useApi } from "@/hooks/use-api";
import { Loading } from "@/components/data/Loading";
import { StatCard } from "@/components/data/StatCard";
import { Chart } from "@/components/data/Chart";
import { ProviderLink } from "@/components/data/ProviderLink";
import { ChainLink } from "@/components/data/ChainLink";
import { LavaAmount } from "@/components/data/LavaAmount";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SortableTable } from "@/components/data/SortableTable";
import { type ColumnDef } from "@tanstack/react-table";
import { formatNumber, formatNumberKMB, formatLava } from "@/lib/format";
import { ArrowUpNarrowWide, CalendarArrowUp, Landmark, Users, ArrowUpRight } from "lucide-react";

interface IndexStats {
  totalCu: string;
  totalRelays: string;
  cu30d: string;
  relays30d: string;
  totalStake: string;
  activeProviderCount: number;
  latestBlock: number;
  latestBlockTime: string;
}

interface TopChain {
  specId: string;
  totalCu: string;
  totalRelays: string;
}

interface Provider {
  provider: string;
  moniker: string;
  identity?: string;
  activeServices: number;
  totalStake: string;
  totalDelegation: string;
}

interface ChartPoint {
  date: string;
  chainId: string;
  cu: string;
  relays: string;
  qosSync: number | null;
  qosAvailability: number | null;
  qosLatency: number | null;
}

export default function DashboardPage() {
  const { data: stats, isLoading } = useApi<IndexStats>("/index/stats");
  const { data: topChains } = useApi<{ data: TopChain[] }>("/index/top-chains");
  const { data: providersResp } = useApi<{ data: Provider[] }>("/providers?limit=10");
  const [rangeDays, setRangeDays] = useState(90);
  const chartFrom = rangeDays > 0
    ? new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    : "";
  const { data: chartResp } = useApi<{ data: ChartPoint[] }>(
    `/index/charts${chartFrom ? `?from=${chartFrom}` : ""}`,
  );

  const [selectedChain, setSelectedChain] = useState<string>("all");

  // Aggregate chart data by day
  const chartData = useMemo(() => {
    if (!chartResp?.data) return [];
    const byDay = new Map<string, { date: string; relays: number; cu: number; qosSync: number; qosAvail: number; qosLat: number; weight: number }>();

    for (const p of chartResp.data) {
      if (selectedChain !== "all" && p.chainId !== selectedChain) continue;
      const existing = byDay.get(p.date);
      const relays = Number(p.relays);
      if (existing) {
        existing.relays += relays;
        existing.cu += Number(p.cu);
        if (p.qosSync != null) {
          existing.qosSync += (p.qosSync ?? 0) * relays;
          existing.qosAvail += (p.qosAvailability ?? 0) * relays;
          existing.qosLat += (p.qosLatency ?? 0) * relays;
          existing.weight += relays;
        }
      } else {
        byDay.set(p.date, {
          date: p.date,
          relays,
          cu: Number(p.cu),
          qosSync: (p.qosSync ?? 0) * relays,
          qosAvail: (p.qosAvailability ?? 0) * relays,
          qosLat: (p.qosLatency ?? 0) * relays,
          weight: p.qosSync != null ? relays : 0,
        });
      }
    }

    return Array.from(byDay.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        date: d.date,
        relays: d.relays,
        cu: d.cu,
        qosSync: d.weight > 0 ? d.qosSync / d.weight : null,
        qosAvailability: d.weight > 0 ? d.qosAvail / d.weight : null,
        qosLatency: d.weight > 0 ? d.qosLat / d.weight : null,
      }));
  }, [chartResp, selectedChain]);

  const chainOptions = useMemo(() => {
    if (!chartResp?.data) return [];
    return [...new Set(chartResp.data.map((p) => p.chainId))].sort();
  }, [chartResp]);

  const providers = useMemo(() => providersResp?.data?.slice(0, 10) ?? [], [providersResp]);
  const chains = useMemo(() => topChains?.data?.slice(0, 10) ?? [], [topChains]);

  const providerCols: ColumnDef<Provider, unknown>[] = useMemo(() => [
    {
      id: "moniker", header: "Moniker",
      accessorFn: (row) => row.moniker || row.provider,
      cell: ({ row }) => <ProviderLink address={row.original.provider} moniker={row.original.moniker} identity={row.original.identity} showAvatar />,
    },
    { id: "activeServices", header: "Active Services", accessorFn: (row) => row.activeServices },
    {
      id: "totalStake", header: "Total Stake",
      sortingFn: (a, b) => Number(BigInt(a.original.totalStake || "0") - BigInt(b.original.totalStake || "0")),
      cell: ({ row }) => <LavaAmount amount={row.original.totalStake} />,
    },
  ], []);

  const chainCols: ColumnDef<TopChain, unknown>[] = useMemo(() => [
    {
      id: "specId", header: "Chain",
      accessorFn: (row) => row.specId,
      cell: ({ row }) => <ChainLink chainId={row.original.specId} />,
    },
    {
      id: "totalCu", header: "Total CU",
      sortingFn: (a, b) => Number(BigInt(a.original.totalCu || "0") - BigInt(b.original.totalCu || "0")),
      cell: ({ row }) => <span className="text-right">{formatNumberKMB(row.original.totalCu)}</span>,
    },
    {
      id: "totalRelays", header: "Total Relays",
      sortingFn: (a, b) => Number(BigInt(a.original.totalRelays || "0") - BigInt(b.original.totalRelays || "0")),
      cell: ({ row }) => <span className="text-right">{formatNumberKMB(row.original.totalRelays)}</span>,
    },
  ], []);

  if (isLoading) return <Loading />;

  return (
    <>
      {/* Stat Cards */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 md:gap-8 xl:grid-cols-4">
        <StatCard
          label="Relays (All Time)"
          value={
            <span title={formatNumber(stats?.totalRelays ?? 0)} style={{ whiteSpace: "nowrap" }}>
              {formatNumberKMB(stats?.totalRelays ?? 0)}
            </span>
          }
          icon={<ArrowUpNarrowWide className="h-4 w-4 text-muted-foreground" />}
          tooltip="Total relays for all chains on lava."
        />
        <StatCard
          label="Relays (30 days)"
          value={formatNumberKMB(stats?.relays30d ?? 0)}
          icon={<CalendarArrowUp className="h-4 w-4 text-muted-foreground" />}
          tooltip="Total relays for all chains on lava in the last 30 days."
        />
        <StatCard
          label="Stake"
          value={`${formatLava(stats?.totalStake ?? "0")} LAVA`}
          icon={<Landmark className="h-4 w-4 text-muted-foreground" />}
          tooltip="Total stake and total delegations for all providers of all chains on lava."
        />
        <StatCard
          label="Active Providers"
          value={stats?.activeProviderCount ?? 0}
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <div style={{ marginTop: "30px" }} />

      {/* Index Chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Network Activity</CardTitle>
            <CardDescription>Daily relays and QoS scores</CardDescription>
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
              value={selectedChain}
              onChange={(e) => setSelectedChain(e.target.value)}
              className="bg-card border border-border rounded px-3 py-1.5 text-sm text-foreground"
            >
              <option value="all">All Chains</option>
              {chainOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
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
            isLoading={!chartResp}
            brushable
            toggleable
          />
        </CardContent>
      </Card>

      <div style={{ marginTop: "30px" }} />

      {/* Two-column tables */}
      <div className="grid gap-4 md:gap-8 lg:grid-cols-2 xl:grid-cols-4">
        {/* Top Providers */}
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-center">
            <div className="grid gap-2">
              <CardTitle>Providers</CardTitle>
              <CardDescription>Top providers by stake</CardDescription>
            </div>
            <Button asChild size="sm" className="ml-auto gap-1">
              <Link href="/providers">
                View All
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <SortableTable data={providers} columns={providerCols} defaultSort={[{ id: "totalStake", desc: true }]} />
          </CardContent>
        </Card>

        {/* Top Chains */}
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-center">
            <div className="grid gap-2">
              <CardTitle>Chains</CardTitle>
              <CardDescription>Top chains by relays (30d)</CardDescription>
            </div>
            <Button asChild size="sm" className="ml-auto gap-1">
              <Link href="/chains">
                View All
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <SortableTable data={chains} columns={chainCols} defaultSort={[{ id: "totalRelays", desc: true }]} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
