"use client";

import { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useApi } from "@/hooks/use-api";
import { Loading } from "@/components/data/Loading";
import { StatCard } from "@/components/data/StatCard";

const IndexChart = dynamic(() => import("@/components/data/IndexChart").then((m) => m.IndexChart), { ssr: false });
import { ProviderLink } from "@/components/data/ProviderLink";
import { ChainLink } from "@/components/data/ChainLink";
import { LavaAmount } from "@/components/data/LavaAmount";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SortableTable } from "@/components/data/SortableTable";
import { type ColumnDef } from "@tanstack/react-table";
import { formatNumber, formatNumberKMB, formatLava, formatLavaKMB } from "@/lib/format";
import { ArrowUpNarrowWide, CalendarArrowUp, Landmark, Users, ArrowUpRight, Activity } from "lucide-react";

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

/* ─── Mock chart data for development (toggle via Dev Tools > Mock chart data) ─── */
function generateMockChartData(): ChartPoint[] {
  const chains = ["ETH1", "LAVA", "COSMOSHUB", "AXELAR", "NEAR", "POLYGON", "EVMOS", "FUSE"];
  const points: ChartPoint[] = [];
  const now = new Date();

  // Seeded pseudo-random for deterministic output
  let seed = 42;
  const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return seed / 2147483647; };

  for (let i = 90; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().slice(0, 10);

    for (const chain of chains) {
      const baseRelays: Record<string, number> = {
        ETH1: 800000, LAVA: 500000, COSMOSHUB: 300000, AXELAR: 200000,
        NEAR: 150000, POLYGON: 100000, EVMOS: 80000, FUSE: 50000,
      };
      const base = baseRelays[chain] || 100000;
      const variation = 1 + Math.sin(i * 0.1 + chains.indexOf(chain)) * 0.3;
      const trend = 1 + (90 - i) * 0.003;
      const relays = Math.round(base * variation * trend);

      // QoS near 1.0 with a dip around day 40-55
      const baseDip = i > 40 && i < 55 ? 0.06 : 0;
      const qosSync = Math.min(1, Math.max(0, 0.995 - baseDip + (rand() - 0.5) * 0.008));
      const qosAvail = Math.min(1, Math.max(0, 0.998 - baseDip * 0.5 + (rand() - 0.5) * 0.004));
      const qosLat = Math.min(1, Math.max(0, 0.993 - baseDip + (rand() - 0.5) * 0.01));

      points.push({ date: dateStr, chainId: chain, cu: String(relays * 5), relays: String(relays), qosSync, qosAvailability: qosAvail, qosLatency: qosLat });
    }
  }
  return points;
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

  // Mock chart data toggle (controlled via Dev Tools menu)
  const [useMockChart, setUseMockChart] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem("lava-mock-chart") === "true",
  );
  useEffect(() => {
    const handler = () => setUseMockChart(localStorage.getItem("lava-mock-chart") === "true");
    window.addEventListener("mock-chart-toggle", handler);
    return () => window.removeEventListener("mock-chart-toggle", handler);
  }, []);

  const chartData = useMemo(() => {
    if (useMockChart) {
      const mock = generateMockChartData();
      // Filter mock data by range to match real API behavior
      if (chartFrom) return mock.filter((p) => p.date >= chartFrom);
      return mock;
    }
    return chartResp?.data;
  }, [chartResp, useMockChart, chartFrom]);

  const providers = useMemo(() => providersResp?.data?.slice(0, 10) ?? [], [providersResp]);
  const chains = useMemo(() => topChains?.data?.slice(0, 10) ?? [], [topChains]);

  const providerCols: ColumnDef<Provider, unknown>[] = useMemo(() => [
    {
      id: "moniker", header: "Moniker",
      accessorFn: (row) => row.moniker || row.provider,
      cell: ({ row }) => (
        <div className="min-w-0">
          <ProviderLink address={row.original.provider} moniker={row.original.moniker} identity={row.original.identity} showAvatar />
        </div>
      ),
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
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 md:gap-8 xl:grid-cols-5">
        <StatCard
          label="Total Relays"
          value={formatNumberKMB(stats?.totalRelays ?? 0)}
          fullValue={formatNumber(stats?.totalRelays ?? 0)}
          icon={<Activity className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          label="Relays (30 days)"
          value={formatNumberKMB(stats?.relays30d ?? 0)}
          fullValue={formatNumber(stats?.relays30d ?? 0)}
          icon={<CalendarArrowUp className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          label="CU (30 days)"
          value={formatNumberKMB(stats?.cu30d ?? 0)}
          fullValue={formatNumber(stats?.cu30d ?? 0)}
          icon={<ArrowUpNarrowWide className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          label="Total Stake"
          value={`${formatLavaKMB(stats?.totalStake ?? "0")} LAVA`}
          fullValue={`${formatLava(stats?.totalStake ?? "0")} LAVA`}
          icon={<Landmark className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          label="Active Providers"
          value={stats?.activeProviderCount ?? 0}
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <div style={{ marginTop: "30px" }} />

      {/* Index Chart — matches jsinfo-ui layout with innovations */}
      <IndexChart data={chartData} isLoading={!useMockChart && !chartResp} rangeDays={rangeDays} onRangeChange={setRangeDays} />

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
            <Button asChild size="sm" variant="outline" className="ml-auto gap-1">
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
            <Button asChild size="sm" variant="outline" className="ml-auto gap-1">
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
