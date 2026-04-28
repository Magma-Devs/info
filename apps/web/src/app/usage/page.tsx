"use client";

import { useState } from "react";
import { Activity, Shield, TrendingUp } from "lucide-react";
import { ChartSkeleton } from "@/components/data/ChartSkeleton";
import { useApi } from "@/hooks/use-api";
import { UptimeChart } from "./_components/UptimeChart";
import { IncidentStats } from "./_components/IncidentStats";
import type { BlockchainIncidentsFile, CloudIncidentsFile } from "./types";

function periodLabel(months: number) {
  if (months === 12) return "1 Year";
  if (months === 6) return "6 Months";
  return "3 Months";
}

export default function UsagePage() {
  const [selectedPeriod, setSelectedPeriod] = useState<3 | 6 | 12>(3);

  const cloud = useApi<CloudIncidentsFile>("/usage/cloud-incidents");
  const blockchain = useApi<BlockchainIncidentsFile>("/usage/blockchain-incidents");

  const cloudIncidents = cloud.data?.incidents ?? [];
  const blockchainIncidents = blockchain.data?.incidents ?? [];

  const isLoading = cloud.isLoading || blockchain.isLoading;
  const loadError = cloud.error || blockchain.error;

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="mb-2 text-4xl font-bold">Network Uptime &amp; Reliability</h1>
        <p className="text-muted-foreground">
          Compare Lava Network&apos;s uptime performance against major cloud providers
        </p>
      </div>

      <div className="mb-8 grid gap-6 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="mb-2 flex items-center gap-3">
            <Shield className="h-5 w-5 text-green-500" />
            <h3 className="text-sm font-medium text-muted-foreground">Lava Uptime</h3>
          </div>
          <p className="text-3xl font-bold text-green-500">100%</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Last {periodLabel(selectedPeriod).toLowerCase()}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <div className="mb-2 flex items-center gap-3">
            <Activity className="h-5 w-5 text-blue-500" />
            <h3 className="text-sm font-medium text-muted-foreground">Lava Total Incidents</h3>
          </div>
          <p className="text-3xl font-bold">0</p>
          <p className="mt-1 text-xs text-muted-foreground">No downtime reported</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <div className="mb-2 flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-purple-500" />
            <h3 className="text-sm font-medium text-muted-foreground">Lava Reliability Score</h3>
          </div>
          <p className="text-3xl font-bold text-purple-500">A+</p>
          <p className="mt-1 text-xs text-muted-foreground">Industry leading</p>
        </div>
      </div>

      <div className="mb-8 rounded-lg border border-border bg-card p-6">
        <div className="mb-6">
          <h2 className="mb-2 text-2xl font-semibold">
            Uptime Comparison (Last {periodLabel(selectedPeriod)})
          </h2>
          <p className="text-sm text-muted-foreground">
            Real-time comparison of network reliability across major infrastructure providers. The{" "}
            <span className="font-medium text-pink-400">Blockchain RPCs</span> line shows real
            incidents from major RPC providers, displaying which blockchain networks were affected
            (hover for details). Cloud provider data is fetched from official status pages.
          </p>
        </div>

        {loadError ? (
          <div className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">
            Failed to load incident data.
          </div>
        ) : isLoading ? (
          <ChartSkeleton height={400} />
        ) : (
          <UptimeChart
            blockchainIncidents={blockchainIncidents}
            cloudIncidents={cloudIncidents}
            selectedPeriod={selectedPeriod}
            onPeriodChange={setSelectedPeriod}
          />
        )}

        <div className="mt-4 rounded-md bg-muted/50 p-4 text-xs text-muted-foreground">
          <p className="mb-1 font-semibold">Data insights</p>
          <ul className="list-inside list-disc space-y-1">
            <li>
              <span className="font-medium text-green-400">Lava Network</span>: zero downtime, 100%
              uptime maintained
            </li>
            <li>
              <span className="font-medium text-pink-400">Blockchain RPCs</span>: aggregated
              incidents from major RPC providers — chains affected shown on hover
            </li>
            <li>Cloud provider data represents typical infrastructure reliability patterns</li>
          </ul>
        </div>
      </div>

      <div className="mb-8">
        <div className="mb-6">
          <h2 className="mb-2 text-2xl font-semibold">Service Statistics</h2>
          <p className="text-sm text-muted-foreground">
            Detailed uptime metrics and incident reports for each service (Last{" "}
            {periodLabel(selectedPeriod)})
          </p>
        </div>

        {loadError ? (
          <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
            Failed to load incident data.
          </div>
        ) : isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-lg border border-border bg-card" />
            ))}
          </div>
        ) : (
          <IncidentStats cloudIncidents={cloudIncidents} months={selectedPeriod} />
        )}
      </div>
    </div>
  );
}
