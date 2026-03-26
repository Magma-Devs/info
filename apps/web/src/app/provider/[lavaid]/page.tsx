"use client";

import { use } from "react";
import { useApi } from "@/hooks/use-api";
import { Loading } from "@/components/data/Loading";
import { StatCard } from "@/components/data/StatCard";
import { StatusBadge } from "@/components/data/StatusBadge";
import Link from "next/link";

function fmt(n: string | number): string {
  return Number(n).toLocaleString("en-US");
}

function fmtLava(ulava: string): string {
  try { return Number(BigInt(ulava) / BigInt(1e6)).toLocaleString("en-US"); } catch { return "0"; }
}

interface ProviderDetail {
  provider: string;
  moniker: string;
  stakes: Array<{ specId: string; stake: string; delegation: string; moniker: string }>;
}

interface RewardData {
  data: Array<{ chainId: string; cu: string; relays: string }>;
}

interface ReportData {
  data: Array<{ id: string; provider: string; chainId: string; errors: number; disconnections: number; epoch: string; blockHeight: string; timestamp: string }>;
  pagination: { total: number; page: number; limit: number; pages: number };
}

export default function ProviderPage({ params }: { params: Promise<{ lavaid: string }> }) {
  const { lavaid } = use(params);
  const { data: provider, isLoading } = useApi<ProviderDetail>(`/providers/${lavaid}`);
  const { data: rewards } = useApi<RewardData>(`/providers/${lavaid}/charts`);
  const { data: reports } = useApi<ReportData>(`/providers/${lavaid}/reports?limit=10`);
  const { data: healthData } = useApi<{ data: Array<{ spec: string; status: string; geolocation: string; timestamp: string }> }>(`/providers/${lavaid}/health?limit=20`);

  if (isLoading) return <Loading />;
  if (!provider) return <div className="text-muted-foreground py-12 text-center">Provider not found</div>;

  const totalStake = provider.stakes.reduce((sum, s) => sum + BigInt(s.stake || "0"), 0n);
  const totalDelegation = provider.stakes.reduce((sum, s) => sum + BigInt(s.delegation || "0"), 0n);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href="/providers" className="text-accent text-sm hover:underline">← Back to Providers</Link>

      {/* Provider header */}
      <div>
        <h1 className="text-2xl font-bold">{provider.moniker || "Unknown Provider"}</h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">{provider.provider}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Total Stake" value={`${fmtLava(totalStake.toString())} LAVA`} />
        <StatCard label="Total Delegation" value={`${fmtLava(totalDelegation.toString())} LAVA`} />
        <StatCard label="Active Chains" value={provider.stakes.length} />
      </div>

      {/* Relays per chain (like pie chart data) */}
      {rewards?.data && rewards.data.length > 0 && (
        <div className="rounded-xl border border-border bg-card shadow">
          <div className="p-6 border-b border-border">
            <h2 className="text-lg font-semibold">Relays by Chain</h2>
          </div>
          <div className="divide-y divide-border">
            {rewards.data.map((r) => (
              <div key={r.chainId} className="flex items-center justify-between px-6 py-3">
                <Link href={`/chain/${r.chainId}`} className="text-accent hover:underline">{r.chainId}</Link>
                <div className="flex gap-6 text-sm text-muted-foreground">
                  <span>{fmt(r.cu)} CU</span>
                  <span>{fmt(r.relays)} relays</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Health (placeholder if from health probe/relayserver) */}
      <div className="rounded-xl border border-border bg-card shadow">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold">Health Status</h2>
        </div>
        <div className="p-6">
          {healthData?.data && healthData.data.length > 0 ? (
            <div className="divide-y divide-border">
              {healthData.data.map((h, i) => (
                <div key={i} className="flex items-center justify-between py-2">
                  <span className="text-sm">{h.spec}</span>
                  <div className="flex gap-3 items-center">
                    <span className="text-xs text-muted-foreground">{h.geolocation}</span>
                    <StatusBadge status={h.status} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Health data requires the health probe service. Placeholder — no data available.</p>
          )}
        </div>
      </div>

      {/* Stakes table */}
      <div className="rounded-xl border border-border bg-card shadow">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold">Stakes</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-6 py-3 text-left font-medium text-muted-foreground">Chain</th>
                <th className="px-6 py-3 text-right font-medium text-muted-foreground">Stake</th>
                <th className="px-6 py-3 text-right font-medium text-muted-foreground">Delegation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {provider.stakes.map((s) => (
                <tr key={s.specId} className="hover:bg-muted/20">
                  <td className="px-6 py-3">
                    <Link href={`/chain/${s.specId}`} className="text-accent hover:underline">{s.specId}</Link>
                  </td>
                  <td className="px-6 py-3 text-right text-muted-foreground">{fmtLava(s.stake)} LAVA</td>
                  <td className="px-6 py-3 text-right text-muted-foreground">{fmtLava(s.delegation)} LAVA</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reports table */}
      {reports?.data && reports.data.length > 0 && (
        <div className="rounded-xl border border-border bg-card shadow">
          <div className="p-6 border-b border-border">
            <h2 className="text-lg font-semibold">Recent Reports</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
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
                    <td className="px-6 py-3 text-accent">{r.chainId}</td>
                    <td className="px-6 py-3 text-right">{r.errors}</td>
                    <td className="px-6 py-3 text-right">{r.disconnections}</td>
                    <td className="px-6 py-3 text-right text-muted-foreground">{r.epoch}</td>
                    <td className="px-6 py-3 text-right text-muted-foreground text-xs">{r.timestamp ? new Date(r.timestamp).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
