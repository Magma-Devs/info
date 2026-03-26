"use client";

import { useApi } from "@/hooks/use-api";
import { StatCard } from "@/components/data/StatCard";
import { Loading } from "@/components/data/Loading";
import { ProviderLink } from "@/components/data/ProviderLink";
import { ChainLink } from "@/components/data/ChainLink";
import { LavaAmount } from "@/components/data/LavaAmount";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatNumber, formatNumberKMB, formatLava } from "@/lib/format";
import { Activity, Box, Coins, Users } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

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

interface Provider {
  provider: string;
  moniker: string;
  activeServices: number;
  totalStake: string;
  totalDelegation: string;
}

export default function DashboardPage() {
  const { data: stats, isLoading } = useApi<IndexStats>("/index/stats");
  const { data: topChains } = useApi<{ data: TopChain[] }>("/index/top-chains");
  const { data: providersResp } = useApi<{ data: Provider[] }>("/providers?limit=10");

  if (isLoading) return <Loading />;

  const providers = providersResp?.data?.slice(0, 10) ?? [];
  const chains = topChains?.data?.slice(0, 10) ?? [];

  const chartData = chains.map((c) => ({
    name: c.specId,
    cu: Number(c.totalCu),
    relays: Number(c.totalRelays),
  }));

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total Relays"
          value={formatNumberKMB(stats?.totalRelays ?? 0)}
          icon={<Activity className="h-4 w-4" />}
          subtitle={`${formatNumber(stats?.totalRelays ?? 0)} total`}
        />
        <StatCard
          label="Total CU"
          value={formatNumberKMB(stats?.totalCu ?? 0)}
          icon={<Box className="h-4 w-4" />}
          subtitle={`${formatNumber(stats?.totalCu ?? 0)} total`}
        />
        <StatCard
          label="Total Stake"
          value={`${formatLava(stats?.totalStake ?? "0")} LAVA`}
          icon={<Coins className="h-4 w-4" />}
        />
        <StatCard
          label="Active Providers"
          value={stats?.activeProviderCount ?? 0}
          icon={<Users className="h-4 w-4" />}
          subtitle={`Block #${formatNumber(stats?.latestBlock ?? 0)}`}
        />
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>CU Distribution by Chain</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
              <XAxis dataKey="name" tick={{ fill: "#a3a3a3", fontSize: 11 }} />
              <YAxis tick={{ fill: "#a3a3a3", fontSize: 11 }} tickFormatter={(v) => formatNumberKMB(v)} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0a0a0a", border: "1px solid #262626", borderRadius: 8 }}
                labelStyle={{ color: "#a3a3a3" }}
                formatter={(value: number) => formatNumber(value)}
              />
              <Area type="monotone" dataKey="cu" stroke="#ac4c39" fill="#3e1e1d" fillOpacity={0.6} name="CU" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Two-column tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Providers */}
        <Card>
          <CardHeader>
            <CardTitle>Top Providers by Stake</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Provider</th>
                  <th className="px-6 py-3 text-right font-medium text-muted-foreground">Stake</th>
                  <th className="px-6 py-3 text-right font-medium text-muted-foreground">Chains</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {providers.map((p) => (
                  <tr key={p.provider} className="hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-3"><ProviderLink address={p.provider} moniker={p.moniker} /></td>
                    <td className="px-6 py-3 text-right text-muted-foreground"><LavaAmount amount={p.totalStake} /></td>
                    <td className="px-6 py-3 text-right text-muted-foreground">{p.activeServices}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Top Chains */}
        <Card>
          <CardHeader>
            <CardTitle>Top Chains by CU</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Chain</th>
                  <th className="px-6 py-3 text-right font-medium text-muted-foreground">CU</th>
                  <th className="px-6 py-3 text-right font-medium text-muted-foreground">Relays</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {chains.map((c) => (
                  <tr key={c.specId} className="hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-3"><ChainLink chainId={c.specId} /></td>
                    <td className="px-6 py-3 text-right text-muted-foreground">{formatNumberKMB(c.totalCu)}</td>
                    <td className="px-6 py-3 text-right text-muted-foreground">{formatNumberKMB(c.totalRelays)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
