"use client";

import { Suspense } from "react";
import { useApi } from "@/hooks/use-api";
import { Loading } from "@/components/data/Loading";
import { StatCard } from "@/components/data/StatCard";
import Link from "next/link";

interface Provider {
  provider: string;
  moniker: string;
  activeServices: number;
  totalStake: string;
  totalDelegation: string;
}

interface IndexStats {
  totalCu: string;
  totalRelays: string;
  totalStake: string;
  activeProviderCount: number;
}

function fmt(n: string | number): string {
  return Number(n).toLocaleString("en-US");
}

function fmtLava(ulava: string): string {
  try { return Number(BigInt(ulava) / BigInt(1e6)).toLocaleString("en-US"); } catch { return "0"; }
}

function ProvidersContent() {
  const { data: stats } = useApi<IndexStats>("/index/stats");
  const { data: providersResp, isLoading } = useApi<{ data: Provider[] }>("/providers");

  if (isLoading) return <Loading />;

  const providers = providersResp?.data ?? [];

  return (
    <div className="space-y-6">
      {/* Stat cards row */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Total Relays" value={fmt(stats?.totalRelays ?? 0)} />
        <StatCard label="Total CU" value={fmt(stats?.totalCu ?? 0)} />
        <StatCard label="Total Stake" value={`${fmtLava(stats?.totalStake ?? "0")} LAVA`} />
        <StatCard label="Active Providers" value={stats?.activeProviderCount ?? 0} />
      </div>

      {/* Providers table */}
      <div className="rounded-xl border border-border bg-card shadow">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold">Active Providers</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-6 py-3 text-left font-medium text-muted-foreground">Provider</th>
                <th className="px-6 py-3 text-left font-medium text-muted-foreground">Moniker</th>
                <th className="px-6 py-3 text-right font-medium text-muted-foreground">Services</th>
                <th className="px-6 py-3 text-right font-medium text-muted-foreground">Stake</th>
                <th className="px-6 py-3 text-right font-medium text-muted-foreground">Delegation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {providers.map((p) => (
                <tr key={p.provider} className="hover:bg-muted/20 transition-colors">
                  <td className="px-6 py-3">
                    <Link href={`/provider/${p.provider}`} className="text-accent hover:underline font-mono text-xs">
                      {p.provider.slice(0, 20)}...
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-foreground">{p.moniker || "—"}</td>
                  <td className="px-6 py-3 text-right text-muted-foreground">{p.activeServices}</td>
                  <td className="px-6 py-3 text-right text-muted-foreground">{fmtLava(p.totalStake)} LAVA</td>
                  <td className="px-6 py-3 text-right text-muted-foreground">{fmtLava(p.totalDelegation)} LAVA</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function ProvidersPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ProvidersContent />
    </Suspense>
  );
}
