"use client";

import { Suspense, useState } from "react";
import { useApi } from "@/hooks/use-api";
import { Loading } from "@/components/data/Loading";
import { ProviderLink } from "@/components/data/ProviderLink";
import { ChainLink } from "@/components/data/ChainLink";
import { TimeTooltip } from "@/components/data/TimeTooltip";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatNumber } from "@/lib/format";

type TabType = "events" | "rewards" | "reports";

function EventsContent() {
  const [tab, setTab] = useState<TabType>("rewards");
  const { data: resp, isLoading } = useApi<{
    data: Array<Record<string, any>>;
    pagination: { total: number };
  }>(`/events?type=${tab}&limit=50`);

  return (
    <div className="space-y-6">
      <Card>
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabType)}>
          <CardHeader>
            <TabsList>
              <TabsTrigger value="events">Events</TabsTrigger>
              <TabsTrigger value="rewards">Rewards</TabsTrigger>
              <TabsTrigger value="reports">Reports</TabsTrigger>
            </TabsList>
          </CardHeader>

          {isLoading ? (
            <CardContent><Loading /></CardContent>
          ) : (
            <>
              <div className="px-6 pb-2 text-xs text-muted-foreground">
                {formatNumber(resp?.pagination?.total ?? 0)} total records
              </div>

              <TabsContent value="events">
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-6 py-3 text-left font-medium text-muted-foreground">Block</th>
                        <th className="px-6 py-3 text-left font-medium text-muted-foreground">Type</th>
                        <th className="px-6 py-3 text-left font-medium text-muted-foreground">Provider</th>
                        <th className="px-6 py-3 text-left font-medium text-muted-foreground">Chain</th>
                        <th className="px-6 py-3 text-right font-medium text-muted-foreground">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {resp?.data?.map((r, i) => (
                        <tr key={i} className="hover:bg-muted/20">
                          <td className="px-6 py-2 text-xs">{String(r.blockHeight ?? "")}</td>
                          <td className="px-6 py-2 text-xs">{String(r.eventType ?? "")}</td>
                          <td className="px-6 py-2">{r.provider ? <ProviderLink address={r.provider} /> : "—"}</td>
                          <td className="px-6 py-2">{r.specId ? <ChainLink chainId={r.specId} /> : "—"}</td>
                          <td className="px-6 py-2 text-right">{r.timestamp && <TimeTooltip datetime={r.timestamp} />}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </TabsContent>

              <TabsContent value="rewards">
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-6 py-3 text-left font-medium text-muted-foreground">Provider</th>
                        <th className="px-6 py-3 text-left font-medium text-muted-foreground">Chain</th>
                        <th className="px-6 py-3 text-right font-medium text-muted-foreground">CU</th>
                        <th className="px-6 py-3 text-right font-medium text-muted-foreground">Relays</th>
                        <th className="px-6 py-3 text-right font-medium text-muted-foreground">QoS</th>
                        <th className="px-6 py-3 text-right font-medium text-muted-foreground">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {resp?.data?.map((r, i) => (
                        <tr key={i} className="hover:bg-muted/20">
                          <td className="px-6 py-2">{r.provider ? <ProviderLink address={r.provider} /> : "—"}</td>
                          <td className="px-6 py-2">{r.chainId ? <ChainLink chainId={r.chainId} /> : "—"}</td>
                          <td className="px-6 py-2 text-right">{formatNumber(r.cu ?? 0)}</td>
                          <td className="px-6 py-2 text-right">{formatNumber(r.relayNumber ?? 0)}</td>
                          <td className="px-6 py-2 text-right">{r.qosScore != null ? Number(r.qosScore).toFixed(3) : "—"}</td>
                          <td className="px-6 py-2 text-right">{r.timestamp && <TimeTooltip datetime={r.timestamp} />}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </TabsContent>

              <TabsContent value="reports">
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-6 py-3 text-left font-medium text-muted-foreground">Provider</th>
                        <th className="px-6 py-3 text-left font-medium text-muted-foreground">Chain</th>
                        <th className="px-6 py-3 text-right font-medium text-muted-foreground">Errors</th>
                        <th className="px-6 py-3 text-right font-medium text-muted-foreground">Disconnections</th>
                        <th className="px-6 py-3 text-right font-medium text-muted-foreground">Epoch</th>
                        <th className="px-6 py-3 text-right font-medium text-muted-foreground">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {resp?.data?.map((r, i) => (
                        <tr key={i} className="hover:bg-muted/20">
                          <td className="px-6 py-2">{r.provider ? <ProviderLink address={r.provider} /> : "—"}</td>
                          <td className="px-6 py-2">{r.chainId ? <ChainLink chainId={r.chainId} /> : "—"}</td>
                          <td className="px-6 py-2 text-right">{r.errors ?? 0}</td>
                          <td className="px-6 py-2 text-right">{r.disconnections ?? 0}</td>
                          <td className="px-6 py-2 text-right text-muted-foreground">{r.epoch ?? "—"}</td>
                          <td className="px-6 py-2 text-right">{r.timestamp && <TimeTooltip datetime={r.timestamp} />}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </TabsContent>
            </>
          )}
        </Tabs>
      </Card>
    </div>
  );
}

export default function EventsPage() {
  return <Suspense fallback={<Loading />}><EventsContent /></Suspense>;
}
