"use client";

import { use } from "react";
import { useApi } from "@/hooks/use-api";
import { Loading } from "@/components/data/Loading";
import { StatCard } from "@/components/data/StatCard";
import { TimeTooltip } from "@/components/data/TimeTooltip";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatNumber } from "@/lib/format";
import { Box, Activity } from "lucide-react";
import Link from "next/link";

interface ConsumerDetail { consumer: string; totalCu: string; totalRelays: string; }
interface Subscription { consumer: string; plan: string; }
interface Conflict { id: string; consumer: string; specId: string; voteId: string; blockHeight: string; timestamp: string; }

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
        <StatCard label="Total CU" value={formatNumber(data?.totalCu ?? 0)} icon={<Box className="h-4 w-4" />} />
        <StatCard label="Total Relays" value={formatNumber(data?.totalRelays ?? 0)} icon={<Activity className="h-4 w-4" />} />
      </div>

      <Card>
        <Tabs defaultValue="subscriptions">
          <CardHeader>
            <TabsList>
              <TabsTrigger value="subscriptions">Subscriptions ({subsResp?.data?.length ?? 0})</TabsTrigger>
              <TabsTrigger value="conflicts">Conflicts ({conflictsResp?.data?.length ?? 0})</TabsTrigger>
            </TabsList>
          </CardHeader>

          <TabsContent value="subscriptions">
            <CardContent>
              {subsResp?.data && subsResp.data.length > 0 ? (
                <div className="divide-y divide-border">
                  {subsResp.data.map((s, i) => (
                    <div key={i} className="py-3 flex items-center justify-between">
                      <span className="font-medium">{s.plan}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">No active subscriptions</p>
              )}
            </CardContent>
          </TabsContent>

          <TabsContent value="conflicts">
            <CardContent className="p-0">
              {conflictsResp?.data && conflictsResp.data.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-6 py-3 text-left font-medium text-muted-foreground">Chain</th>
                      <th className="px-6 py-3 text-left font-medium text-muted-foreground">Vote ID</th>
                      <th className="px-6 py-3 text-right font-medium text-muted-foreground">Block</th>
                      <th className="px-6 py-3 text-right font-medium text-muted-foreground">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {conflictsResp.data.map((c) => (
                      <tr key={c.id} className="hover:bg-muted/20">
                        <td className="px-6 py-3 text-accent">{c.specId ?? "—"}</td>
                        <td className="px-6 py-3 text-xs font-mono text-muted-foreground">{c.voteId?.slice(0, 16) ?? "—"}...</td>
                        <td className="px-6 py-3 text-right">{c.blockHeight}</td>
                        <td className="px-6 py-3 text-right">{c.timestamp && <TimeTooltip datetime={c.timestamp} />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-6 text-muted-foreground text-sm">No conflicts reported</div>
              )}
            </CardContent>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
