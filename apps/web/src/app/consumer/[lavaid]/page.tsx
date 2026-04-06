"use client";

import { use, useState, useMemo } from "react";
import Link from "next/link";
import { useApi } from "@/hooks/use-api";
import { Loading } from "@/components/data/Loading";
import { StatCard } from "@/components/data/StatCard";
import { ChainLink } from "@/components/data/ChainLink";
import { TimeTooltip } from "@/components/data/TimeTooltip";
import { Chart } from "@/components/data/Chart";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatNumber, formatNumberKMB } from "@/lib/format";
import { Box, Activity } from "lucide-react";

interface ConsumerDetail { consumer: string; totalCu: string; totalRelays: string; }
interface Subscription { consumer: string; plan: string; }
interface Conflict { id: string; consumer: string; specId: string; voteId: string; blockHeight: string; timestamp: string; }
interface EventRow { id: string; eventType: string; consumer: string; specId: string; blockHeight: string; timestamp: string; data: string; }
interface TimeSeriesEntry {
  date: string; chainId: string; cu: string; relays: string;
  qosSync: number | null; qosAvailability: number | null; qosLatency: number | null;
}

export default function ConsumerPage({ params }: { params: Promise<{ lavaid: string }> }) {
  const { lavaid } = use(params);
  const { data, isLoading } = useApi<ConsumerDetail>(`/consumers/${lavaid}`);
  const { data: subsResp } = useApi<{ data: Subscription[] }>(`/consumers/${lavaid}/subscriptions`);
  const { data: conflictsResp } = useApi<{ data: Conflict[] }>(`/consumers/${lavaid}/conflicts`);
  const { data: eventsResp } = useApi<{ data: EventRow[]; pagination: { total: number } }>(`/consumers/${lavaid}/events?limit=20`);
  const { data: tsResp } = useApi<{ data: TimeSeriesEntry[] }>(`/consumers/${lavaid}/charts?from=${ninetyDaysAgo()}`);

  const [chartChain, setChartChain] = useState<string>("all");

  const chartData = useMemo(() => {
    if (!tsResp?.data) return [];
    const byDay = new Map<string, { date: string; relays: number; cu: number; qS: number; qA: number; qL: number; w: number }>();
    for (const p of tsResp.data) {
      if (chartChain !== "all" && p.chainId !== chartChain) continue;
      const relays = Number(p.relays);
      const existing = byDay.get(p.date);
      if (existing) {
        existing.relays += relays; existing.cu += Number(p.cu);
        if (p.qosSync != null) { existing.qS += p.qosSync * relays; existing.qA += (p.qosAvailability ?? 0) * relays; existing.qL += (p.qosLatency ?? 0) * relays; existing.w += relays; }
      } else {
        byDay.set(p.date, { date: p.date, relays, cu: Number(p.cu), qS: (p.qosSync ?? 0) * relays, qA: (p.qosAvailability ?? 0) * relays, qL: (p.qosLatency ?? 0) * relays, w: p.qosSync != null ? relays : 0 });
      }
    }
    return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({
      date: d.date, relays: d.relays, cu: d.cu,
      qosSync: d.w > 0 ? d.qS / d.w : null, qosAvailability: d.w > 0 ? d.qA / d.w : null, qosLatency: d.w > 0 ? d.qL / d.w : null,
    }));
  }, [tsResp, chartChain]);

  const chainOptions = useMemo(() => {
    if (!tsResp?.data) return [];
    return [...new Set(tsResp.data.map((p) => p.chainId))].sort();
  }, [tsResp]);

  if (isLoading) return <Loading />;

  return (
    <>
      <Link href="/consumers" className="orangelinks text-sm">&larr; Back to Consumers</Link>

      <div style={{ marginLeft: "23px" }}>
        <h1 className="text-3xl font-bold mb-4">{lavaid}</h1>
      </div>

      <div style={{ marginTop: "25px" }} />

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 md:gap-8">
        <StatCard label="CU Sum" value={formatNumberKMB(data?.totalCu ?? 0)} icon={<Box className="h-4 w-4 text-muted-foreground" />} />
        <StatCard label="Relay Sum" value={formatNumberKMB(data?.totalRelays ?? 0)} icon={<Activity className="h-4 w-4 text-muted-foreground" />} />
      </div>

      <div style={{ marginTop: "25px" }} />

      {/* Time-series Chart */}
      {chartData.length > 0 && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Relays &amp; QoS</CardTitle>
                <CardDescription>Daily performance (last 90 days)</CardDescription>
              </div>
              <select
                value={chartChain}
                onChange={(e) => setChartChain(e.target.value)}
                className="bg-card border border-border rounded px-3 py-1.5 text-sm text-foreground"
              >
                <option value="all">All Chains</option>
                {chainOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </CardHeader>
            <CardContent>
              <Chart
                data={chartData}
                series={[
                  { key: "relays", label: "Relays", color: "#ac4c39", type: "area" },
                  { key: "qosSync", label: "QoS Sync", color: "#81b29a" },
                  { key: "qosAvailability", label: "QoS Availability", color: "#f2cc8f" },
                  { key: "qosLatency", label: "QoS Latency", color: "#3d405b" },
                ]}
                xKey="date"
                height={350}
                isLoading={!tsResp}
              />
            </CardContent>
          </Card>
          <div style={{ marginTop: "25px" }} />
        </>
      )}

      <Card>
        <Tabs defaultValue="subscriptions">
          <CardHeader>
            <TabsList>
              <TabsTrigger value="subscriptions">Subscriptions ({subsResp?.data?.length ?? 0})</TabsTrigger>
              <TabsTrigger value="conflicts">Conflicts ({conflictsResp?.data?.length ?? 0})</TabsTrigger>
              <TabsTrigger value="events">Events ({eventsResp?.pagination?.total ?? 0})</TabsTrigger>
            </TabsList>
          </CardHeader>

          <TabsContent value="subscriptions">
            <CardContent>
              {subsResp?.data && subsResp.data.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plan</TableHead>
                      <TableHead>Consumer</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subsResp.data.map((s, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{s.plan}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{s.consumer}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-sm">No active subscriptions</p>
              )}
            </CardContent>
          </TabsContent>

          <TabsContent value="conflicts">
            <CardContent className="p-0">
              {conflictsResp?.data && conflictsResp.data.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Chain</TableHead>
                      <TableHead>Vote ID</TableHead>
                      <TableHead className="text-right">Block</TableHead>
                      <TableHead className="text-right">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conflictsResp.data.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.specId ? <ChainLink chainId={c.specId} /> : "—"}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">{c.voteId?.slice(0, 16) ?? "—"}...</TableCell>
                        <TableCell className="text-right">{c.blockHeight}</TableCell>
                        <TableCell className="text-right">{c.timestamp && <TimeTooltip datetime={c.timestamp} />}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-6 text-muted-foreground text-sm">No conflicts reported</div>
              )}
            </CardContent>
          </TabsContent>

          <TabsContent value="events">
            <CardContent className="p-0">
              {eventsResp?.data && eventsResp.data.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Block</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Chain</TableHead>
                      <TableHead className="text-right">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eventsResp.data.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs">{e.blockHeight}</TableCell>
                        <TableCell className="text-xs">{e.eventType}</TableCell>
                        <TableCell>{e.specId ? <ChainLink chainId={e.specId} /> : "—"}</TableCell>
                        <TableCell className="text-right">{e.timestamp && <TimeTooltip datetime={e.timestamp} />}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-6 text-muted-foreground text-sm">No events available</div>
              )}
            </CardContent>
          </TabsContent>
        </Tabs>
      </Card>
    </>
  );
}

function ninetyDaysAgo(): string {
  return new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
