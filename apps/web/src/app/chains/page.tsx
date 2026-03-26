"use client";

import { useApi } from "@/hooks/use-api";
import { Loading } from "@/components/data/Loading";
import { StatCard } from "@/components/data/StatCard";
import { ChainLink } from "@/components/data/ChainLink";
import { LavaAmount } from "@/components/data/LavaAmount";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatNumber, formatLava } from "@/lib/format";
import { Box, Layers, Coins, Users } from "lucide-react";

interface Spec { specId: string; name: string; providerCount: number; totalStake: string; }
interface IndexStats { latestBlock: number; activeProviderCount: number; totalStake: string; }

export default function ChainsPage() {
  const { data: specsResp, isLoading } = useApi<{ data: Spec[] }>("/specs");
  const { data: stats } = useApi<IndexStats>("/index/stats");
  if (isLoading) return <Loading />;
  const specs = specsResp?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Latest Block" value={formatNumber(stats?.latestBlock ?? 0)} icon={<Box className="h-4 w-4" />} />
        <StatCard label="Total Chains" value={specs.length} icon={<Layers className="h-4 w-4" />} />
        <StatCard label="Total Stake" value={`${formatLava(stats?.totalStake ?? "0")} LAVA`} icon={<Coins className="h-4 w-4" />} />
        <StatCard label="Active Providers" value={stats?.activeProviderCount ?? 0} icon={<Users className="h-4 w-4" />} />
      </div>

      <Card>
        <CardHeader><CardTitle>All Chains ({specs.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Chain</th>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-6 py-3 text-right font-medium text-muted-foreground">Providers</th>
                  <th className="px-6 py-3 text-right font-medium text-muted-foreground">Total Stake</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {specs.map((s) => (
                  <tr key={s.specId} className="hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-3"><ChainLink chainId={s.specId} /></td>
                    <td className="px-6 py-3 text-muted-foreground">{s.name}</td>
                    <td className="px-6 py-3 text-right">{s.providerCount}</td>
                    <td className="px-6 py-3 text-right text-muted-foreground"><LavaAmount amount={s.totalStake} /></td>
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
