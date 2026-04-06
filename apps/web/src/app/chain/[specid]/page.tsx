"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { type ColumnDef } from "@tanstack/react-table";
import { useApi } from "@/hooks/use-api";
import { Loading } from "@/components/data/Loading";
import { StatCard } from "@/components/data/StatCard";
import { StatusBadge } from "@/components/data/StatusBadge";
import { ProviderLink } from "@/components/data/ProviderLink";
import { LavaAmount } from "@/components/data/LavaAmount";
import { SortableTable } from "@/components/data/SortableTable";
import { Chart } from "@/components/data/Chart";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { formatNumber, formatNumberKMB, formatLava } from "@/lib/format";
import { Users, Coins, Box, Shield, Activity, BarChart3 } from "lucide-react";
import { useChainNames } from "@/hooks/use-chain-names";
import { getChainIcon } from "@/lib/chain-icons";

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

function toBigInt(v: string | undefined): bigint {
  try { return BigInt(v ?? "0"); } catch { return 0n; }
}

const specStakeColumns: ColumnDef<SpecStake, unknown>[] = [
  { id: "provider", header: "Provider", accessorFn: (r) => r.moniker || r.provider, cell: ({ row }) => <ProviderLink address={row.original.provider} moniker={row.original.moniker} /> },
  { id: "stake", header: "Stake", sortingFn: (a, b) => Number(toBigInt(a.original.stake) - toBigInt(b.original.stake)), cell: ({ row }) => <LavaAmount amount={row.original.stake} /> },
  { id: "delegation", header: "Delegation", sortingFn: (a, b) => Number(toBigInt(a.original.delegation) - toBigInt(b.original.delegation)), cell: ({ row }) => <LavaAmount amount={row.original.delegation} /> },
  { id: "total", header: "Total", sortingFn: (a, b) => Number((toBigInt(a.original.stake) + toBigInt(a.original.delegation)) - (toBigInt(b.original.stake) + toBigInt(b.original.delegation))), cell: ({ row }) => <LavaAmount amount={String(toBigInt(row.original.stake) + toBigInt(row.original.delegation))} /> },
  { id: "commission", header: "Commission", accessorFn: (r) => Number(r.delegateCommission || "0"), cell: ({ row }) => `${Number(row.original.delegateCommission || "0")}%` },
  { id: "cuSum30d", header: "CU (30d)", sortingFn: (a, b) => Number(toBigInt(a.original.cuSum30d) - toBigInt(b.original.cuSum30d)), cell: ({ row }) => formatNumberKMB(row.original.cuSum30d ?? "0") },
  { id: "relaySum30d", header: "Relays (30d)", sortingFn: (a, b) => Number(toBigInt(a.original.relaySum30d) - toBigInt(b.original.relaySum30d)), cell: ({ row }) => formatNumberKMB(row.original.relaySum30d ?? "0") },
  { id: "geolocation", header: "Location", accessorFn: (r) => r.geolocation, cell: ({ row }) => geoLabel(row.original.geolocation) },
];

interface SpecStake {
  provider: string; moniker: string; stake: string; delegation: string; geolocation: number;
  delegateCommission?: string; cuSum30d?: string; relaySum30d?: string;
}
interface HealthEntry { status: string; count: number; }
interface ChartSummary { chainId: string; cu: string; relays: string; }
interface TimeSeriesEntry {
  date: string; cu: string; relays: string;
  qosSync: number | null; qosAvailability: number | null; qosLatency: number | null;
}

export default function ChainPage({ params }: { params: Promise<{ specid: string }> }) {
  const { specid } = use(params);
  const { data: stakesResp, isLoading } = useApi<{ data: SpecStake[] }>(`/specs/${specid}/stakes`);
  const { data: healthResp } = useApi<{ data: HealthEntry[] }>(`/specs/${specid}/health`);
  const { data: summaryResp } = useApi<{ data: ChartSummary }>(`/specs/${specid}/charts`);
  const [rangeDays, setRangeDays] = useState(90);
  const chartFrom = rangeDays > 0 ? new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) : "";
  const { data: tsResp } = useApi<{ data: TimeSeriesEntry[] }>(`/specs/${specid}/charts${chartFrom ? `?from=${chartFrom}` : ""}`);
  const { getName } = useChainNames();

  const chartData = useMemo(() => {
    if (!tsResp?.data) return [];
    return tsResp.data.map((d) => ({
      date: d.date,
      relays: Number(d.relays),
      cu: Number(d.cu),
      qosSync: d.qosSync,
      qosAvailability: d.qosAvailability,
      qosLatency: d.qosLatency,
    }));
  }, [tsResp]);

  if (isLoading) return <Loading />;
  const stakes = stakesResp?.data ?? [];
  const totalStake = stakes.reduce((sum, s) => sum + BigInt(s.stake || "0"), 0n);
  const totalDelegation = stakes.reduce((sum, s) => sum + BigInt(s.delegation || "0"), 0n);
  const chainName = getName(specid);

  return (
    <>
      <Link href="/chains" className="orangelinks text-sm">&larr; Back to Chains</Link>

      <div style={{ marginLeft: "23px" }} className="flex items-center gap-3">
        <img src={getChainIcon(specid)} alt="" className="w-8 h-8 rounded-md" onError={(e) => (e.currentTarget.style.display = "none")} />
        <h1 className="text-3xl font-bold mb-4">{chainName !== specid ? `${chainName} (${specid})` : specid}</h1>
      </div>

      <div style={{ marginTop: "5px" }} />

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 md:gap-8 xl:grid-cols-4">
        <StatCard label="Active Providers" value={stakes.length} icon={<Users className="h-4 w-4 text-muted-foreground" />} />
        <StatCard label="Total CU" value={formatNumberKMB(summaryResp?.data?.cu ?? "0")} icon={<Box className="h-4 w-4 text-muted-foreground" />} />
        <StatCard label="Total Relays" value={formatNumberKMB(summaryResp?.data?.relays ?? "0")} icon={<Activity className="h-4 w-4 text-muted-foreground" />} />
        <StatCard label="Total Stake" value={<LavaAmount amount={totalStake.toString()} />} icon={<Coins className="h-4 w-4 text-muted-foreground" />} />
      </div>

      <div style={{ marginTop: "25px" }} />

      {/* Endpoint health */}
      <Card>
        <CardHeader><CardTitle>Endpoint Health</CardTitle></CardHeader>
        <CardContent>
          {healthResp?.data && healthResp.data.length > 0 ? (
            <div className="flex gap-4 flex-wrap">
              {healthResp.data.map((h) => (
                <div key={h.status} className="border border-border rounded-lg px-4 py-2 text-sm">
                  <StatusBadge status={h.status} />
                  <span className="font-semibold ml-2">{h.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm flex items-center gap-2">
              <Shield className="h-4 w-4" /> Endpoint health data requires the health probe service.
            </p>
          )}
        </CardContent>
      </Card>

      <div style={{ marginTop: "25px" }} />

      {/* Optimizer Metrics — requires Relays DB, placeholder */}
      <Card className="border-dashed opacity-60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Consumer Optimizer Metrics</CardTitle>
          <CardDescription>Requires relay server data — coming soon</CardDescription>
        </CardHeader>
      </Card>

      <div style={{ marginTop: "25px" }} />

      {/* Time-series Chart */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Relays &amp; QoS</CardTitle>
            <CardDescription>Daily performance</CardDescription>
          </div>
          <div className="flex gap-1">
            {[{ label: "30d", days: 30 }, { label: "90d", days: 90 }, { label: "1y", days: 365 }, { label: "All", days: 0 }].map((r) => (
              <button key={r.label} onClick={() => setRangeDays(r.days)}
                className={`px-2 py-1 text-xs rounded ${rangeDays === r.days ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted border border-border"}`}>
                {r.label}
              </button>
            ))}
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
            isLoading={!tsResp}
            brushable
            toggleable
          />
        </CardContent>
      </Card>

      <div style={{ marginTop: "25px" }} />

      {/* Providers (stakes) table */}
      <Card>
        <CardHeader><CardTitle>Providers on {specid} ({stakes.length})</CardTitle></CardHeader>
        <CardContent>
          <SortableTable data={stakes} columns={specStakeColumns} defaultSort={[{ id: "stake", desc: true }]} />
        </CardContent>
      </Card>
    </>
  );
}

function ninetyDaysAgo(): string {
  return new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
