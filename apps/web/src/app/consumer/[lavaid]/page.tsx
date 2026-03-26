"use client";

import { use } from "react";
import { useApi } from "@/hooks/use-api";
import { Loading } from "@/components/data/Loading";
import { StatCard } from "@/components/data/StatCard";
import Link from "next/link";

function fmt(n: string | number): string {
  return Number(n).toLocaleString("en-US");
}

interface ConsumerDetail {
  consumer: string;
  totalCu: string;
  totalRelays: string;
}

interface Subscription {
  consumer: string;
  plan: string;
}

interface Conflict {
  id: string;
  consumer: string;
  specId: string;
  voteId: string;
  blockHeight: string;
  timestamp: string;
}

export default function ConsumerPage({ params }: { params: Promise<{ lavaid: string }> }) {
  const { lavaid } = use(params);
  const { data, isLoading } = useApi<ConsumerDetail>(`/consumers/${lavaid}`);
  const { data: subsResp } = useApi<{ data: Subscription[] }>(`/consumers/${lavaid}/subscriptions`);
  const { data: conflictsResp } = useApi<{ data: Conflict[] }>(`/consumers/${lavaid}/conflicts`);

  if (isLoading) return <Loading />;

  return (
    <div className="space-y-6">
      <Link href="/consumers" className="text-accent text-sm hover:underline">← Back to Consumers</Link>

      <h1 className="text-2xl font-bold font-mono">{lavaid}</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard label="Total CU" value={fmt(data?.totalCu ?? 0)} />
        <StatCard label="Total Relays" value={fmt(data?.totalRelays ?? 0)} />
      </div>

      {/* Subscriptions */}
      <div className="rounded-xl border border-border bg-card shadow">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold">Subscriptions</h2>
        </div>
        <div className="p-6">
          {subsResp?.data && subsResp.data.length > 0 ? (
            <div className="space-y-2">
              {subsResp.data.map((s, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <span className="text-sm text-foreground">{s.plan}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No active subscriptions</p>
          )}
        </div>
      </div>

      {/* Conflicts */}
      <div className="rounded-xl border border-border bg-card shadow">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold">Conflicts</h2>
        </div>
        <div className="p-6">
          {conflictsResp?.data && conflictsResp.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-2 text-left text-muted-foreground">Chain</th>
                    <th className="px-4 py-2 text-left text-muted-foreground">Vote ID</th>
                    <th className="px-4 py-2 text-right text-muted-foreground">Block</th>
                    <th className="px-4 py-2 text-right text-muted-foreground">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {conflictsResp.data.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2 text-accent">{c.specId}</td>
                      <td className="px-4 py-2 text-xs font-mono">{c.voteId?.slice(0, 16)}...</td>
                      <td className="px-4 py-2 text-right">{c.blockHeight}</td>
                      <td className="px-4 py-2 text-right text-xs text-muted-foreground">{c.timestamp ? new Date(c.timestamp).toLocaleString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No conflicts reported</p>
          )}
        </div>
      </div>
    </div>
  );
}
