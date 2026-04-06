"use client";

import { Suspense, useState } from "react";
import { usePaginatedApi } from "@/hooks/use-paginated-api";
import { Loading } from "@/components/data/Loading";
import { PaginationControls } from "@/components/data/PaginationControls";
import { downloadCsv } from "@/lib/csv";
import { Download } from "lucide-react";
import Link from "next/link";

type TabType = "events" | "rewards" | "reports";

function fmt(n: string | number): string {
  return Number(n).toLocaleString("en-US");
}

function EventsContent() {
  const [tab, setTab] = useState<TabType>("events");
  const { data, pagination, setPage, isLoading } = usePaginatedApi<Record<string, unknown>>(`/events?type=${tab}`);

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["events", "rewards", "reports"] as TabType[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? "text-accent border-b-2 border-accent"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Loading />
      ) : (
        <div className="rounded-xl border border-border bg-card shadow">
          <div className="p-4 border-b border-border text-sm text-muted-foreground flex items-center justify-between">
            <span>{fmt(pagination.total)} total records</span>
            <button onClick={() => downloadCsv(data as Record<string, unknown>[], `events-${tab}.csv`)}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
              <Download size={14} /> CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {tab === "events" && (
                    <>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Block</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Provider</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Chain</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Time</th>
                    </>
                  )}
                  {tab === "rewards" && (
                    <>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Provider</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Consumer</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Chain</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">CU</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Relays</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">QoS</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Exc. QoS</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Time</th>
                    </>
                  )}
                  {tab === "reports" && (
                    <>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Provider</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Chain</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">CU</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Errors</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Disconnections</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Epoch</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Time</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.map((row, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    {tab === "events" && (
                      <>
                        <td className="px-4 py-2 text-xs">{String(row.blockHeight ?? "")}</td>
                        <td className="px-4 py-2 text-xs">{String(row.eventType ?? "")}</td>
                        <td className="px-4 py-2">
                          {row.provider ? (
                            <Link href={`/provider/${row.provider}`} className="text-accent hover:underline text-xs font-mono">
                              {String(row.provider).slice(0, 16)}...
                            </Link>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-2 text-xs">{String(row.specId ?? row.chainId ?? "—")}</td>
                        <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                          {row.timestamp ? new Date(String(row.timestamp)).toLocaleString() : "—"}
                        </td>
                      </>
                    )}
                    {tab === "rewards" && (
                      <>
                        <td className="px-4 py-2">
                          {row.provider ? (
                            <Link href={`/provider/${row.provider}`} className="text-accent hover:underline text-xs font-mono">
                              {String(row.provider).slice(0, 16)}...
                            </Link>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-2">
                          {row.consumer ? (
                            <Link href={`/consumer/${row.consumer}`} className="text-accent hover:underline text-xs font-mono">
                              {String(row.consumer).slice(0, 16)}...
                            </Link>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-2 text-xs">{String(row.chainId ?? "—")}</td>
                        <td className="px-4 py-2 text-right">{fmt(String(row.cu ?? 0))}</td>
                        <td className="px-4 py-2 text-right">{fmt(String(row.relayNumber ?? 0))}</td>
                        <td className="px-4 py-2 text-right">{row.qosScore != null ? Number(row.qosScore).toFixed(3) : "—"}</td>
                        <td className="px-4 py-2 text-right">{row.excellenceQosSync != null ? Number(row.excellenceQosSync).toFixed(3) : "—"}</td>
                        <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                          {row.timestamp ? new Date(String(row.timestamp)).toLocaleString() : "—"}
                        </td>
                      </>
                    )}
                    {tab === "reports" && (
                      <>
                        <td className="px-4 py-2">
                          {row.provider ? (
                            <Link href={`/provider/${row.provider}`} className="text-accent hover:underline text-xs font-mono">
                              {String(row.provider).slice(0, 16)}...
                            </Link>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-2 text-xs">{String(row.chainId ?? "—")}</td>
                        <td className="px-4 py-2 text-right">{fmt(String(row.cu ?? 0))}</td>
                        <td className="px-4 py-2 text-right">{String(row.errors ?? 0)}</td>
                        <td className="px-4 py-2 text-right">{String(row.disconnections ?? 0)}</td>
                        <td className="px-4 py-2 text-right text-muted-foreground">{String(row.epoch ?? "—")}</td>
                        <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                          {row.timestamp ? new Date(String(row.timestamp)).toLocaleString() : "—"}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationControls pagination={pagination} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}

export default function EventsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <EventsContent />
    </Suspense>
  );
}
