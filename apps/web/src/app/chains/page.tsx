"use client";

import { useApi } from "@/hooks/use-api";
import { Loading } from "@/components/data/Loading";
import { StatCard } from "@/components/data/StatCard";
import Link from "next/link";

interface Spec {
  specId: string;
  name: string;
  providerCount: number;
  totalStake: string;
}

interface IndexStats {
  latestBlock: number;
  activeProviderCount: number;
  totalStake: string;
}

function fmt(n: string | number): string {
  return Number(n).toLocaleString("en-US");
}

function fmtLava(ulava: string): string {
  try { return Number(BigInt(ulava) / BigInt(1e6)).toLocaleString("en-US"); } catch { return "0"; }
}

export default function ChainsPage() {
  const { data: specsResp, isLoading } = useApi<{ data: Spec[] }>("/specs");
  const { data: stats } = useApi<IndexStats>("/index/stats");

  if (isLoading) return <Loading />;
  const specs = specsResp?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Latest Block" value={fmt(stats?.latestBlock ?? 0)} />
        <StatCard label="Total Chains" value={specs.length} />
        <StatCard label="Total Stake" value={`${fmtLava(stats?.totalStake ?? "0")} LAVA`} />
        <StatCard label="Active Providers" value={stats?.activeProviderCount ?? 0} />
      </div>

      <div className="rounded-xl border border-border bg-card shadow">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold">All Chains</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-6 py-3 text-left font-medium text-muted-foreground">Chain</th>
                <th className="px-6 py-3 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-6 py-3 text-right font-medium text-muted-foreground">Providers</th>
                <th className="px-6 py-3 text-right font-medium text-muted-foreground">Total Stake</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {specs.map((s) => (
                <tr key={s.specId} className="hover:bg-muted/20 transition-colors">
                  <td className="px-6 py-3">
                    <Link href={`/chain/${s.specId}`} className="text-accent hover:underline font-medium">{s.specId}</Link>
                  </td>
                  <td className="px-6 py-3 text-muted-foreground">{s.name}</td>
                  <td className="px-6 py-3 text-right">{s.providerCount}</td>
                  <td className="px-6 py-3 text-right text-muted-foreground">{fmtLava(s.totalStake)} LAVA</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
