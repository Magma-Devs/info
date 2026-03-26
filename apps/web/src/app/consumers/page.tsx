"use client";

import { Suspense } from "react";
import { useApi } from "@/hooks/use-api";
import { Loading } from "@/components/data/Loading";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import Link from "next/link";

interface Consumer { consumer: string; totalCu: string; totalRelays: string; }

function ConsumersContent() {
  const { data: resp, isLoading } = useApi<{ data: Consumer[] }>("/consumers");
  if (isLoading) return <Loading />;
  const consumers = resp?.data ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Consumers ({consumers.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">Consumer</th>
                  <th className="px-6 py-3 text-right font-medium text-muted-foreground">Total CU</th>
                  <th className="px-6 py-3 text-right font-medium text-muted-foreground">Total Relays</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {consumers.map((c) => (
                  <tr key={c.consumer} className="hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-3">
                      <Link href={`/consumer/${c.consumer}`} className="text-accent hover:underline font-mono text-xs">
                        {c.consumer?.slice(0, 30)}...
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-right text-muted-foreground">{formatNumber(c.totalCu)}</td>
                    <td className="px-6 py-3 text-right text-muted-foreground">{formatNumber(c.totalRelays)}</td>
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

export default function ConsumersPage() {
  return <Suspense fallback={<Loading />}><ConsumersContent /></Suspense>;
}
