"use client";

import { useState, useMemo } from "react";
import { useApi } from "@/hooks/use-api";
import { Chart } from "./Chart";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

interface OptimizerMetric {
  hourly_timestamp: string;
  provider: string;
  consumer: string;
  consumer_hostname: string;
  chain_id: string;
  latency_score: number | null;
  availability_score: number | null;
  sync_score: number | null;
  generic_score: number | null;
  node_error_rate: number | null;
  entry_index: number | null;
  selection_availability: number | null;
  selection_latency: number | null;
  selection_sync: number | null;
  selection_stake: number | null;
  selection_composite: number | null;
}

interface ProviderResponse {
  metrics: OptimizerMetric[];
  possibleConsumers: string[];
  possibleChainIds: string[];
}

interface SpecResponse {
  metrics: OptimizerMetric[];
  possibleConsumers: string[];
  providers: string[];
}

type MetricMode = "wrs" | "scores";

const WRS_SERIES = [
  { key: "selection_composite", label: "Composite", color: "#0082FB" },
  { key: "selection_latency", label: "Latency", color: "#00D7B0" },
  { key: "selection_availability", label: "Availability", color: "#0EBA53" },
  { key: "selection_sync", label: "Sync", color: "#7679FF" },
  { key: "selection_stake", label: "Stake", color: "#E76678" },
];

const SCORE_SERIES = [
  { key: "latency_score", label: "Latency", color: "#0082FB" },
  { key: "availability_score", label: "Availability", color: "#00D7B0" },
  { key: "sync_score", label: "Sync", color: "#0EBA53" },
  { key: "generic_score", label: "Reputation", color: "#E76678" },
  { key: "node_error_rate", label: "Error Rate", color: "#FF3900" },
];

function formatDateParam(d: Date): string {
  return d.toISOString().split("T")[0];
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// --- Provider Optimizer Chart ---

export function ProviderOptimizerChart({ providerId }: { providerId: string }) {
  const [mode, setMode] = useState<MetricMode>("wrs");
  const [days, setDays] = useState(7);
  const [consumer, setConsumer] = useState("all");
  const [chainId, setChainId] = useState("all");

  const from = formatDateParam(daysAgo(days));
  const to = formatDateParam(new Date());

  const params = new URLSearchParams({ from, to, consumer, chain_id: chainId });
  const { data, isLoading } = useApi<ProviderResponse>(`/providers/${providerId}/optimizer-metrics?${params}`);

  const chartData = useMemo(() => {
    if (!data?.metrics) return [];
    return data.metrics.map((m) => ({
      time: new Date(m.hourly_timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
      ...m,
    }));
  }, [data]);

  const series = mode === "wrs" ? WRS_SERIES : SCORE_SERIES;

  const isUnavailable = !isLoading && data && "error" in data;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Consumer Optimizer Metrics
            </CardTitle>
            <CardDescription>How consumers perceive this provider</CardDescription>
          </div>
          {!isUnavailable && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-md border border-border overflow-hidden text-xs">
                <button onClick={() => setMode("wrs")} className={`px-3 py-1.5 transition-colors ${mode === "wrs" ? "bg-accent text-white" : "text-muted-foreground hover:text-foreground"}`}>WRS</button>
                <button onClick={() => setMode("scores")} className={`px-3 py-1.5 transition-colors ${mode === "scores" ? "bg-accent text-white" : "text-muted-foreground hover:text-foreground"}`}>Scores</button>
              </div>
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground">
                <option value={2}>2 days</option>
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
              </select>
              {data?.possibleChainIds && data.possibleChainIds.length > 1 && (
                <select value={chainId} onChange={(e) => setChainId(e.target.value)} className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground">
                  <option value="all">All Chains</option>
                  {data.possibleChainIds.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              {data?.possibleConsumers && data.possibleConsumers.length > 1 && (
                <select value={consumer} onChange={(e) => setConsumer(e.target.value)} className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground">
                  <option value="all">All Consumers</option>
                  {data.possibleConsumers.map((c) => <option key={c} value={c}>{c.length > 20 ? `${c.slice(0, 10)}...${c.slice(-6)}` : c}</option>)}
                </select>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isUnavailable ? (
          <div className="flex flex-col items-center justify-center text-muted-foreground py-8">
            <BarChart3 className="h-10 w-10 mb-3 opacity-20" />
            <span className="text-sm">Optimizer metrics unavailable</span>
            <span className="text-xs opacity-60 mt-1">Relays database not connected</span>
          </div>
        ) : (
          <Chart data={chartData} series={series} xKey="time" height={350} isLoading={isLoading} brushable toggleable />
        )}
      </CardContent>
    </Card>
  );
}

// --- Spec/Chain Optimizer Chart ---

const PROVIDER_COLORS = [
  "#0082FB", "#00D7B0", "#0EBA53", "#7679FF", "#E76678",
  "#EC25F4", "#FF1D70", "#FF3900", "#FFBC0A", "#1F4A30",
];

export function ChainOptimizerChart({ specId }: { specId: string }) {
  const [days, setDays] = useState(7);
  const [consumer, setConsumer] = useState("all");
  const [metric, setMetric] = useState("selection_composite");

  const from = formatDateParam(daysAgo(days));
  const to = formatDateParam(new Date());

  const params = new URLSearchParams({ from, to, consumer });
  const { data, isLoading } = useApi<SpecResponse>(`/specs/${specId}/optimizer-metrics?${params}`);

  const topProviders = useMemo(() => {
    if (!data?.providers) return [];
    return data.providers.slice(0, 10);
  }, [data]);

  const chartData = useMemo(() => {
    if (!data?.metrics) return [];

    const byTime = new Map<string, Record<string, unknown>>();

    for (const m of data.metrics) {
      if (!topProviders.includes(m.provider)) continue;
      const time = new Date(m.hourly_timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
      const value = m[metric as keyof OptimizerMetric];
      if (value == null) continue;

      if (!byTime.has(time)) byTime.set(time, { time });
      const entry = byTime.get(time)!;
      const label = m.provider.slice(0, 10);
      entry[label] = value;
    }

    return Array.from(byTime.values());
  }, [data, metric, topProviders]);

  const series = useMemo(() =>
    topProviders.map((p, i) => ({
      key: p.slice(0, 10),
      label: p.slice(0, 10) + "...",
      color: PROVIDER_COLORS[i % PROVIDER_COLORS.length],
    })),
  [topProviders]);

  const isUnavailable = !isLoading && data && "error" in data;

  const metricOptions = [
    { value: "selection_composite", label: "WRS Composite" },
    { value: "selection_latency", label: "WRS Latency" },
    { value: "selection_availability", label: "WRS Availability" },
    { value: "selection_sync", label: "WRS Sync" },
    { value: "selection_stake", label: "WRS Stake" },
    { value: "latency_score", label: "Latency Score" },
    { value: "availability_score", label: "Availability Score" },
    { value: "sync_score", label: "Sync Score" },
    { value: "generic_score", label: "Reputation Score" },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Consumer Optimizer Metrics
            </CardTitle>
            <CardDescription>Provider performance as seen by consumers</CardDescription>
          </div>
          {!isUnavailable && (
            <div className="flex flex-wrap items-center gap-2">
              <select value={metric} onChange={(e) => setMetric(e.target.value)} className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground">
                {metricOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground">
                <option value={2}>2 days</option>
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
              </select>
              {data?.possibleConsumers && data.possibleConsumers.length > 1 && (
                <select value={consumer} onChange={(e) => setConsumer(e.target.value)} className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground">
                  <option value="all">All Consumers</option>
                  {data.possibleConsumers.map((c) => <option key={c} value={c}>{c.length > 20 ? `${c.slice(0, 10)}...${c.slice(-6)}` : c}</option>)}
                </select>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isUnavailable ? (
          <div className="flex flex-col items-center justify-center text-muted-foreground py-8">
            <BarChart3 className="h-10 w-10 mb-3 opacity-20" />
            <span className="text-sm">Optimizer metrics unavailable</span>
            <span className="text-xs opacity-60 mt-1">Relays database not connected</span>
          </div>
        ) : (
          <Chart data={chartData} series={series} xKey="time" height={350} isLoading={isLoading} brushable toggleable />
        )}
      </CardContent>
    </Card>
  );
}
