"use client";

import { Suspense } from "react";
import { useApi } from "@/hooks/use-api";
import { Loading } from "@/components/data/Loading";
import { StatCard } from "@/components/data/StatCard";
import { ProviderLink } from "@/components/data/ProviderLink";
import { LavaAmount } from "@/components/data/LavaAmount";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatNumber, formatNumberKMB, formatLava } from "@/lib/format";
import { Activity, Box, Coins, Users } from "lucide-react";

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

function ProvidersContent() {
  const { data: stats } = useApi<IndexStats>("/index/stats");
  const { data: providersResp, isLoading } = useApi<{ data: Provider[] }>("/providers");

  if (isLoading) return <Loading />;

  const providers = providersResp?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Total Relays" value={formatNumberKMB(stats?.totalRelays ?? 0)} icon={<Activity className="h-4 w-4" />} />
        <StatCard label="Total CU" value={formatNumberKMB(stats?.totalCu ?? 0)} icon={<Box className="h-4 w-4" />} />
        <StatCard label="Total Stake" value={`${formatLava(stats?.totalStake ?? "0")} LAVA`} icon={<Coins className="h-4 w-4" />} />
        <StatCard label="Active Providers" value={stats?.activeProviderCount ?? 0} icon={<Users className="h-4 w-4" />} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Providers ({providers.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Provider</th>
                  <th className="px-6 py-3 text-right font-medium text-muted-foreground">Active Services</th>
                  <th className="px-6 py-3 text-right font-medium text-muted-foreground">Stake</th>
                  <th className="px-6 py-3 text-right font-medium text-muted-foreground">Delegation</th>
                  <th className="px-6 py-3 text-right font-medium text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {providers.map((p) => (
                  <tr key={p.provider} className="hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-3">
                      <ProviderLink address={p.provider} moniker={p.moniker} />
                    </td>
                    <td className="px-6 py-3 text-right text-muted-foreground">{p.activeServices}</td>
                    <td className="px-6 py-3 text-right text-muted-foreground"><LavaAmount amount={p.totalStake} /></td>
                    <td className="px-6 py-3 text-right text-muted-foreground"><LavaAmount amount={p.totalDelegation} /></td>
                    <td className="px-6 py-3 text-right font-medium">
                      <LavaAmount amount={String(BigInt(p.totalStake || "0") + BigInt(p.totalDelegation || "0"))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
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
