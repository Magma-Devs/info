"use client";

import { useApi } from "@/hooks/use-api";
import { StatCard } from "@/components/data/StatCard";
import { Loading } from "@/components/data/Loading";
import Link from "next/link";

interface IndexStats {
  totalCu: string;
  totalRelays: string;
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

function fmt(n: string | number): string {
  return Number(n).toLocaleString("en-US");
}

function fmtLava(ulava: string): string {
  try {
    return Number(BigInt(ulava) / BigInt(1e6)).toLocaleString("en-US");
  } catch {
    return "0";
  }
}

export default function DashboardPage() {
  const { data: stats, isLoading } = useApi<IndexStats>("/index/stats");
  const { data: topChains } = useApi<{ data: TopChain[] }>("/index/top-chains");

  if (isLoading) return <Loading />;

  return (
    <div className="space-y-8">
      {/* Stat Cards - matches jsinfo-ui provider-cards-grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Total Relays" value={fmt(stats?.totalRelays ?? 0)} />
        <StatCard label="Total CU" value={fmt(stats?.totalCu ?? 0)} />
        <StatCard label="Total Stake" value={`${fmtLava(stats?.totalStake ?? "0")} LAVA`} />
        <StatCard label="Active Providers" value={stats?.activeProviderCount ?? 0} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard label="Latest Block" value={fmt(stats?.latestBlock ?? 0)} />
        <StatCard
          label="Last Block Time"
          value={stats?.latestBlockTime ? new Date(stats.latestBlockTime).toLocaleString() : "—"}
        />
      </div>

      {/* Top Chains Table - matches jsinfo-ui IndexChainsTableBlock */}
      <div className="rounded-xl border border-border bg-card shadow">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold">Top Chains by CU</h2>
        </div>
        <div className="divide-y divide-border">
          {topChains?.data?.slice(0, 15).map((chain) => (
            <Link
              key={chain.specId}
              href={`/chain/${chain.specId}`}
              className="flex items-center justify-between px-6 py-3 hover:bg-muted/30 transition-colors"
            >
              <span className="font-medium text-accent">{chain.specId}</span>
              <div className="flex gap-8 text-sm text-muted-foreground">
                <span>{fmt(chain.totalCu)} CU</span>
                <span>{fmt(chain.totalRelays)} relays</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
