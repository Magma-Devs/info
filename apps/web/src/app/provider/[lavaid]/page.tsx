"use client";

import { use } from "react";
import { useApi } from "@/hooks/use-api";
import { Loading } from "@/components/data/Loading";
import { StatCard } from "@/components/data/StatCard";
import { StatusBadge } from "@/components/data/StatusBadge";
import { ChainLink } from "@/components/data/ChainLink";
import { LavaAmount } from "@/components/data/LavaAmount";
import { TimeTooltip } from "@/components/data/TimeTooltip";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatNumber, formatLava } from "@/lib/format";
import { Coins, Link2, Shield } from "lucide-react";
import Link from "next/link";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";

const COLORS = ["#ac4c39", "#ab5a49", "#e07a5f", "#f2cc8f", "#81b29a", "#3d405b", "#f4f1de", "#e07a5f"];

interface ProviderDetail {
  provider: string;
  moniker: string;
  stakes: Array<{ specId: string; stake: string; delegation: string; moniker: string }>;
}

interface RewardData {
  data: Array<{ chainId: string; cu: string; relays: string }>;
}

interface ReportRow {
  id: string;
  provider: string;
  chainId: string;
  errors: number;
  disconnections: number;
  epoch: string;
  blockHeight: string;
  timestamp: string;
}

export default function ProviderPage({ params }: { params: Promise<{ lavaid: string }> }) {
  const { lavaid } = use(params);
  const { data: provider, isLoading } = useApi<ProviderDetail>(`/providers/${lavaid}`);
  const { data: rewards } = useApi<RewardData>(`/providers/${lavaid}/charts`);
  const { data: reports } = useApi<{ data: ReportRow[]; pagination: { total: number } }>(`/providers/${lavaid}/reports?limit=20`);
  const { data: healthData } = useApi<{ data: Array<{ spec: string; status: string; geolocation: string; timestamp: string }> }>(`/providers/${lavaid}/health?limit=20`);

  if (isLoading) return <Loading />;
  if (!provider) return <div className="text-muted-foreground py-12 text-center">Provider not found</div>;

  const totalStake = provider.stakes.reduce((sum, s) => sum + BigInt(s.stake || "0"), 0n);
  const totalDelegation = provider.stakes.reduce((sum, s) => sum + BigInt(s.delegation || "0"), 0n);

  const pieData = rewards?.data?.map((r) => ({
    name: r.chainId,
    value: Number(r.cu),
  })) ?? [];

  return (
    <div className="space-y-6">
      <Link href="/providers" className="text-accent text-sm hover:underline">← Back to Providers</Link>

      <div>
        <h1 className="text-2xl font-bold">{provider.moniker || "Unknown Provider"}</h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">{provider.provider}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Total Stake" value={<LavaAmount amount={totalStake.toString()} />} icon={<Coins className="h-4 w-4" />} />
        <StatCard label="Total Delegation" value={<LavaAmount amount={totalDelegation.toString()} />} icon={<Coins className="h-4 w-4" />} />
        <StatCard label="Active Chains" value={provider.stakes.length} icon={<Link2 className="h-4 w-4" />} />
      </div>

      {/* Pie chart + Stakes table side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Relay pie chart */}
        {pieData.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Relays by Chain</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={100} label={({ name }) => name}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "#0a0a0a", border: "1px solid #262626", borderRadius: 8 }} formatter={(v: number) => formatNumber(v)} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Stakes table */}
        <Card>
          <CardHeader><CardTitle>Stakes ({provider.stakes.length} chains)</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Chain</th>
                  <th className="px-6 py-3 text-right font-medium text-muted-foreground">Stake</th>
                  <th className="px-6 py-3 text-right font-medium text-muted-foreground">Delegation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {provider.stakes.map((s) => (
                  <tr key={s.specId} className="hover:bg-muted/20">
                    <td className="px-6 py-3"><ChainLink chainId={s.specId} /></td>
                    <td className="px-6 py-3 text-right text-muted-foreground"><LavaAmount amount={s.stake} /></td>
                    <td className="px-6 py-3 text-right text-muted-foreground"><LavaAmount amount={s.delegation} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Health (placeholder) */}
      <Card>
        <CardHeader><CardTitle>Health Status</CardTitle></CardHeader>
        <CardContent>
          {healthData?.data && healthData.data.length > 0 ? (
            <div className="divide-y divide-border">
              {healthData.data.map((h, i) => (
                <div key={i} className="flex items-center justify-between py-3">
                  <ChainLink chainId={h.spec} />
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{h.geolocation}</span>
                    <StatusBadge status={h.status} />
                    {h.timestamp && <TimeTooltip datetime={h.timestamp} />}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm flex items-center gap-2">
              <Shield className="h-4 w-4" /> Health data requires the health probe service — placeholder.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Tabs: Reports */}
      <Card>
        <Tabs defaultValue="reports">
          <CardHeader>
            <TabsList>
              <TabsTrigger value="reports">Reports ({reports?.pagination?.total ?? 0})</TabsTrigger>
            </TabsList>
          </CardHeader>
          <TabsContent value="reports">
            <CardContent className="p-0">
              {reports?.data && reports.data.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-6 py-3 text-left font-medium text-muted-foreground">Chain</th>
                      <th className="px-6 py-3 text-right font-medium text-muted-foreground">Errors</th>
                      <th className="px-6 py-3 text-right font-medium text-muted-foreground">Disconnections</th>
                      <th className="px-6 py-3 text-right font-medium text-muted-foreground">Epoch</th>
                      <th className="px-6 py-3 text-right font-medium text-muted-foreground">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {reports.data.map((r) => (
                      <tr key={r.id} className="hover:bg-muted/20">
                        <td className="px-6 py-3"><ChainLink chainId={r.chainId} /></td>
                        <td className="px-6 py-3 text-right">{r.errors}</td>
                        <td className="px-6 py-3 text-right">{r.disconnections}</td>
                        <td className="px-6 py-3 text-right text-muted-foreground">{r.epoch}</td>
                        <td className="px-6 py-3 text-right">{r.timestamp && <TimeTooltip datetime={r.timestamp} />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-6 text-muted-foreground text-sm">No reports available</div>
              )}
            </CardContent>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
