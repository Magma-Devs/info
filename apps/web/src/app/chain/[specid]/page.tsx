"use client";

import { use } from "react";
import { useApi } from "@/hooks/use-api";
import { Loading } from "@/components/data/Loading";
import { StatCard } from "@/components/data/StatCard";
import { ProviderLink } from "@/components/data/ProviderLink";
import { LavaAmount } from "@/components/data/LavaAmount";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatNumber, formatNumberKMB, formatLava } from "@/lib/format";
import { Users, Coins, Box, Shield } from "lucide-react";
import Link from "next/link";

interface SpecStake { provider: string; moniker: string; stake: string; delegation: string; geolocation: number; }
interface ChartEntry { chainId: string; cu: string; relays: string; }
interface HealthEntry { status: string; count: number; }

export default function ChainPage({ params }: { params: Promise<{ specid: string }> }) {
  const { specid } = use(params);
  const { data: stakesResp, isLoading } = useApi<{ data: SpecStake[] }>(`/specs/${specid}/stakes`);
  const { data: chartResp } = useApi<{ data: ChartEntry[] }>(`/specs/${specid}/charts`);
  const { data: healthResp } = useApi<{ data: HealthEntry[] }>(`/specs/${specid}/health`);

  if (isLoading) return <Loading />;
  const stakes = stakesResp?.data ?? [];
  const totalStake = stakes.reduce((sum, s) => sum + BigInt(s.stake || "0"), 0n);
  const totalDelegation = stakes.reduce((sum, s) => sum + BigInt(s.delegation || "0"), 0n);

  return (
    <div className="space-y-6">
      <Link href="/chains" className="text-accent text-sm hover:underline">← Back to Chains</Link>
      <h1 className="text-2xl font-bold">{specid}</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Active Providers" value={stakes.length} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Total Stake" value={<LavaAmount amount={totalStake.toString()} />} icon={<Coins className="h-4 w-4" />} />
        <StatCard label="Total Delegation" value={<LavaAmount amount={totalDelegation.toString()} />} icon={<Coins className="h-4 w-4" />} />
        <StatCard label="Total CU" value={formatNumberKMB(chartResp?.data?.[0]?.cu ?? 0)} icon={<Box className="h-4 w-4" />} />
      </div>

      {/* Endpoint health placeholder */}
      <Card>
        <CardHeader><CardTitle>Endpoint Health</CardTitle></CardHeader>
        <CardContent>
          {healthResp?.data && healthResp.data.length > 0 ? (
            <div className="flex gap-4 flex-wrap">
              {healthResp.data.map((h) => (
                <div key={h.status} className="border border-border rounded-lg px-4 py-2 text-sm">
                  <span className="text-muted-foreground">{h.status}:</span> <span className="font-semibold">{h.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm flex items-center gap-2">
              <Shield className="h-4 w-4" /> Endpoint health data requires the health probe service — placeholder.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Providers table */}
      <Card>
        <CardHeader><CardTitle>Providers on {specid} ({stakes.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Provider</th>
                  <th className="px-6 py-3 text-right font-medium text-muted-foreground">Stake</th>
                  <th className="px-6 py-3 text-right font-medium text-muted-foreground">Delegation</th>
                  <th className="px-6 py-3 text-right font-medium text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stakes.map((s) => (
                  <tr key={s.provider} className="hover:bg-muted/20">
                    <td className="px-6 py-3"><ProviderLink address={s.provider} moniker={s.moniker} /></td>
                    <td className="px-6 py-3 text-right text-muted-foreground"><LavaAmount amount={s.stake} /></td>
                    <td className="px-6 py-3 text-right text-muted-foreground"><LavaAmount amount={s.delegation} /></td>
                    <td className="px-6 py-3 text-right font-medium"><LavaAmount amount={String(BigInt(s.stake || "0") + BigInt(s.delegation || "0"))} /></td>
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
