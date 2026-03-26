"use client";

import { use } from "react";
import { useApi } from "@/hooks/use-api";
import { Loading } from "@/components/data/Loading";
import { StatCard } from "@/components/data/StatCard";
import Link from "next/link";

function fmt(n: string | number): string {
  return Number(n).toLocaleString("en-US");
}

function fmtLava(ulava: string): string {
  try { return Number(BigInt(ulava) / BigInt(1e6)).toLocaleString("en-US"); } catch { return "0"; }
}

interface SpecStake {
  provider: string;
  moniker: string;
  stake: string;
  delegation: string;
  geolocation: number;
}

interface ChartEntry {
  chainId: string;
  cu: string;
  relays: string;
}

interface HealthEntry {
  status: string;
  count: number;
}

export default function ChainPage({ params }: { params: Promise<{ specid: string }> }) {
  const { specid } = use(params);
  const { data: stakesResp, isLoading } = useApi<{ data: SpecStake[] }>(`/specs/${specid}/stakes`);
  const { data: chartResp } = useApi<{ data: ChartEntry[] }>(`/specs/${specid}/charts`);
  const { data: healthResp } = useApi<{ data: HealthEntry[] }>(`/specs/${specid}/health`);

  if (isLoading) return <Loading />;

  const stakes = stakesResp?.data ?? [];
  const totalStake = stakes.reduce((sum, s) => sum + BigInt(s.stake || "0"), 0n);

  return (
    <div className="space-y-6">
      <Link href="/chains" className="text-accent text-sm hover:underline">← Back to Chains</Link>

      <h1 className="text-2xl font-bold">{specid}</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Active Providers" value={stakes.length} />
        <StatCard label="Total Stake" value={`${fmtLava(totalStake.toString())} LAVA`} />
        <StatCard
          label="Total CU"
          value={fmt(chartResp?.data?.[0]?.cu ?? 0)}
          subtitle="From indexed relay payments"
        />
        <StatCard
          label="Total Relays"
          value={fmt(chartResp?.data?.[0]?.relays ?? 0)}
        />
      </div>

      {/* Health summary (placeholder if from health probe) */}
      {healthResp?.data && healthResp.data.length > 0 ? (
        <div className="flex gap-3">
          {healthResp.data.map((h) => (
            <div key={h.status} className="rounded-lg border border-border px-3 py-1 text-sm">
              <span className="text-muted-foreground">{h.status}:</span> <span className="font-medium">{h.count}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">Endpoint health data requires the health probe service.</div>
      )}

      {/* Stakes table */}
      <div className="rounded-xl border border-border bg-card shadow">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold">Providers on {specid}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-6 py-3 text-left font-medium text-muted-foreground">Provider</th>
                <th className="px-6 py-3 text-left font-medium text-muted-foreground">Moniker</th>
                <th className="px-6 py-3 text-right font-medium text-muted-foreground">Stake</th>
                <th className="px-6 py-3 text-right font-medium text-muted-foreground">Delegation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stakes.map((s) => (
                <tr key={s.provider} className="hover:bg-muted/20">
                  <td className="px-6 py-3">
                    <Link href={`/provider/${s.provider}`} className="text-accent hover:underline font-mono text-xs">
                      {s.provider.slice(0, 20)}...
                    </Link>
                  </td>
                  <td className="px-6 py-3">{s.moniker || "—"}</td>
                  <td className="px-6 py-3 text-right text-muted-foreground">{fmtLava(s.stake)} LAVA</td>
                  <td className="px-6 py-3 text-right text-muted-foreground">{fmtLava(s.delegation)} LAVA</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
