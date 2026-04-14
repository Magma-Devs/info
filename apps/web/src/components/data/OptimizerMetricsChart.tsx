"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Brush,
} from "recharts";
import { useApi } from "@/hooks/use-api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { BarChart3, Loader2, ChevronsUpDown } from "lucide-react";
import { getChainIcon } from "@/lib/chain-icons";

/* ─── Types ─── */

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

interface SeriesConfig {
  key: string;
  label: string;
  color: string;
  description?: string;
}

const WRS_SERIES: SeriesConfig[] = [
  { key: "selection_composite", label: "Composite", color: "#0082FB", description: "Overall combined score used for provider selection" },
  { key: "selection_latency", label: "Latency", color: "#00D7B0", description: "Latency component of the selection weight" },
  { key: "selection_availability", label: "Availability", color: "#0EBA53", description: "Availability component of the selection weight" },
  { key: "selection_sync", label: "Sync", color: "#7679FF", description: "Sync component of the selection weight" },
  { key: "selection_stake", label: "Stake", color: "#E76678", description: "Stake component of the selection weight" },
];

const SCORE_SERIES: SeriesConfig[] = [
  { key: "latency_score", label: "Latency", color: "#0082FB", description: "Lower is better. Measures response time" },
  { key: "availability_score", label: "Availability", color: "#00D7B0", description: "Higher is better. Measures uptime" },
  { key: "sync_score", label: "Sync", color: "#0EBA53", description: "Higher is better. Measures block sync accuracy" },
  { key: "generic_score", label: "Reputation", color: "#E76678", description: "Overall reputation score" },
  { key: "node_error_rate", label: "Error Rate", color: "#FF3900", description: "Lower is better. Rate of node errors" },
];

const MODE_DESCRIPTIONS: Record<MetricMode, string> = {
  wrs: "WRS normalized selection scores range from 0 to 1, where higher is better. These scores reflect how the provider is weighted in the Weighted Random Selection algorithm.",
  scores: "Raw quality scores as reported by consumers. These measure actual provider performance metrics.",
};

const PROVIDER_COLORS = [
  "#0082FB", "#00D7B0", "#0EBA53", "#7679FF", "#E76678",
  "#EC25F4", "#FF1D70", "#FF3900", "#FFBC0A", "#1F4A30",
];

/* ─── Chain Icon ─── */

function ChainIcon({ chainId }: { chainId: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="w-4 h-4 rounded-sm shrink-0 bg-muted flex items-center justify-center text-[9px] font-medium text-muted-foreground">
        {chainId.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img src={getChainIcon(chainId)} alt="" className="w-4 h-4 rounded-sm shrink-0" loading="lazy" onError={() => setFailed(true)} />
  );
}

/* ─── Chain Dropdown ─── */

function ChainDropdown({ chains, selected, onChange }: { chains: string[]; selected: string; onChange: (chain: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = chains.filter((c) => c.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.localeCompare(b));

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-[140px] bg-card border border-border rounded px-2 py-1.5 text-xs text-foreground hover:bg-muted/50"
      >
        <span className="truncate">{selected === "all" ? "All Chains" : selected}</span>
        <ChevronsUpDown className="h-3 w-3 ml-1 opacity-50 shrink-0" />
      </button>
      <div
        className={`absolute top-full mt-1 right-0 w-[220px] bg-card border border-border rounded-lg shadow-lg z-50 p-2 transition-all duration-150 origin-top ${
          open ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
        }`}
      >
        <input
          type="text"
          placeholder="Search chains..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-muted border border-border rounded px-2 py-1.5 text-sm text-foreground mb-2 outline-none"
        />
        <div className="max-h-[200px] overflow-y-auto">
          <button
            onClick={() => { onChange("all"); setOpen(false); }}
            className={`flex items-center gap-2 w-full p-1.5 text-sm rounded ${selected === "all" ? "bg-accent/20 text-foreground" : "hover:bg-muted text-foreground"}`}
          >
            All Chains
          </button>
          {filtered.map((chain) => (
            <button
              key={chain}
              onClick={() => { onChange(chain); setOpen(false); }}
              className={`flex items-center gap-2 w-full p-1.5 text-sm rounded ${selected === chain ? "bg-accent/20 text-foreground" : "hover:bg-muted text-foreground"}`}
            >
              <ChainIcon chainId={chain} />
              <span>{chain}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Consumer Dropdown ─── */

function ConsumerDropdown({ consumers, selected, onChange }: { consumers: string[]; selected: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-[120px] bg-card border border-border rounded px-2 py-1.5 text-xs text-foreground hover:bg-muted/50"
      >
        <span className="truncate">{selected === "all" ? "All Consumers" : selected}</span>
        <ChevronsUpDown className="h-3 w-3 ml-1 opacity-50 shrink-0" />
      </button>
      <div
        className={`absolute top-full mt-1 right-0 w-auto min-w-[200px] max-w-[400px] bg-card border border-border rounded-lg shadow-lg z-50 p-2 transition-all duration-150 origin-top ${
          open ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
        }`}
      >
        <div className="max-h-[200px] overflow-y-auto">
          <button
            onClick={() => { onChange("all"); setOpen(false); }}
            className={`w-full text-left p-1.5 text-sm rounded whitespace-nowrap ${selected === "all" ? "bg-accent/20 text-foreground" : "hover:bg-muted text-foreground"}`}
          >
            All Consumers
          </button>
          {consumers.map((c) => (
            <button
              key={c}
              onClick={() => { onChange(c); setOpen(false); }}
              className={`w-full text-left p-1.5 text-sm rounded whitespace-nowrap ${selected === c ? "bg-accent/20 text-foreground" : "hover:bg-muted text-foreground"}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Helpers ─── */

function formatDateParam(d: Date): string {
  return d.toISOString().split("T")[0];
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function formatTimestamp(v: string): string {
  return new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTimestampFull(v: string): string {
  return new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* ─── Custom Tooltip ─── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="custom-tooltip">
      <p className="font-semibold text-sm mb-2">{formatTimestampFull(label)}</p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((entry: any) => (
        <p key={entry.dataKey} className="text-sm">
          <span className="inline-block w-3 h-3 rounded-full mr-2" style={{ backgroundColor: entry.color || entry.stroke }} />
          <span className="font-bold">{entry.name}</span>:{" "}
          <span className="font-mono">{Number(entry.value).toFixed(4)}</span>
        </p>
      ))}
    </div>
  );
}

/* ─── Metric Legend Grid ─── */

function MetricLegend({ series, hidden, onToggle }: { series: SeriesConfig[]; hidden: Set<string>; onToggle: (key: string) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
      {series.map((s) => (
        <button
          key={s.key}
          onClick={() => onToggle(s.key)}
          className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 text-left transition-opacity"
          style={{ opacity: hidden.has(s.key) ? 0.35 : 1 }}
        >
          <span className="inline-block w-3 h-3 rounded-full mt-0.5 shrink-0" style={{ backgroundColor: s.color }} />
          <div>
            <span className="text-sm font-medium">{s.label}</span>
            <p className="text-xs text-muted-foreground leading-tight">{s.description}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

/* ─── Mode Info Tooltip ─── */

function ModeInfo({ mode }: { mode: MetricMode }) {
  return (
    <span className="relative group">
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-muted text-muted-foreground text-[10px] font-bold cursor-help">?</span>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2 bg-card border border-border rounded-md text-xs text-muted-foreground shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
        {MODE_DESCRIPTIONS[mode]}
      </span>
    </span>
  );
}

/* ─── Shared Empty / Loading / Unavailable States ─── */

function ChartLoading() {
  return (
    <div className="flex flex-col items-center justify-center text-muted-foreground h-[350px]">
      <Loader2 className="h-8 w-8 mb-3 opacity-30 animate-spin" />
      <span className="text-sm">Loading chart data...</span>
    </div>
  );
}

function ChartEmpty() {
  return (
    <div className="flex flex-col items-center justify-center text-muted-foreground h-[350px]">
      <BarChart3 className="h-10 w-10 mb-3 opacity-20" />
      <span className="text-sm">No optimizer metrics available</span>
      <span className="text-xs opacity-60 mt-1">No data for this time range</span>
    </div>
  );
}

function ChartUnavailable() {
  return (
    <div className="flex flex-col items-center justify-center text-muted-foreground h-[350px]">
      <BarChart3 className="h-10 w-10 mb-3 opacity-20" />
      <span className="text-sm">Optimizer metrics unavailable</span>
      <span className="text-xs opacity-60 mt-1">Relays database not connected</span>
    </div>
  );
}

/* ─── Range Buttons ─── */

function RangeButtons({ days, onChange }: { days: number; onChange: (d: number) => void }) {
  return (
    <div className="flex gap-1">
      {[
        { label: "1d", days: 1 },
        { label: "7d", days: 7 },
        { label: "30d", days: 30 },
        { label: "90d", days: 90 },
      ].map((r) => (
        <button
          key={r.label}
          onClick={() => onChange(r.days)}
          className={`px-2 py-1 text-xs rounded ${
            days === r.days
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-muted border border-border"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ProviderOptimizerChart
   ═══════════════════════════════════════════════ */

export function ProviderOptimizerChart({ providerId }: { providerId: string }) {
  const [mode, setMode] = useState<MetricMode>("wrs");
  const [days, setDays] = useState(7);
  const [consumer, setConsumer] = useState("all");
  const [chainId, setChainId] = useState("all");
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const from = formatDateParam(daysAgo(days));
  const to = formatDateParam(new Date());

  const params = new URLSearchParams({ from, to, consumer, chain_id: chainId });
  const { data, isLoading } = useApi<ProviderResponse>(`/providers/${providerId}/optimizer-metrics?${params}`);

  const allChains = useMemo(() => {
    if (!data?.possibleChainIds) return [];
    return [...data.possibleChainIds].sort((a, b) => a.localeCompare(b));
  }, [data]);

  const sortedConsumers = useMemo(() => {
    if (!data?.possibleConsumers) return [];
    return [...data.possibleConsumers].sort((a, b) => a.localeCompare(b));
  }, [data]);

  const chartData = useMemo(() => {
    if (!data?.metrics?.length) return [];
    return data.metrics.map((m) => ({ ...m, time: m.hourly_timestamp }));
  }, [data]);

  const series = mode === "wrs" ? WRS_SERIES : SCORE_SERIES;
  const isUnavailable = !isLoading && data && "error" in data;

  const toggleSeries = useCallback((key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">Consumer Optimizer Metrics <ModeInfo mode={mode} /></CardTitle>
          <CardDescription>How consumers perceive this provider</CardDescription>
        </div>
        {!isUnavailable && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex rounded-md border border-border overflow-hidden text-xs">
              <button onClick={() => { setMode("wrs"); setHidden(new Set()); }} className={`px-3 py-1.5 transition-colors ${mode === "wrs" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}>WRS</button>
              <button onClick={() => { setMode("scores"); setHidden(new Set()); }} className={`px-3 py-1.5 transition-colors ${mode === "scores" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}>Scores</button>
            </div>
            <ChainDropdown chains={allChains} selected={chainId} onChange={setChainId} />
            {sortedConsumers.length > 1 && (
              <ConsumerDropdown consumers={sortedConsumers} selected={consumer} onChange={setConsumer} />
            )}
            <RangeButtons days={days} onChange={setDays} />
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isUnavailable ? <ChartUnavailable /> : isLoading ? <ChartLoading /> : chartData.length === 0 ? <ChartEmpty /> : (
          <>
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 14.9%)" />
                  <XAxis
                    dataKey="time"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={32}
                    tick={{ fill: "#888", fontSize: 12 }}
                    tickFormatter={formatTimestamp}
                  />
                  <YAxis
                    tick={{ fill: "#888", fontSize: 12 }}
                    tickFormatter={(v: number) => v.toFixed(2)}
                  />
                  <Tooltip content={<ChartTooltip />} />

                  {series.map((s) =>
                    hidden.has(s.key) ? null : (
                      <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} dot={false} strokeWidth={2} />
                    )
                  )}

                  <Brush
                    dataKey="time"
                    height={30}
                    stroke="rgba(136, 136, 136, 0.3)"
                    fill="#0a0a0a"
                    travellerWidth={10}
                    tickFormatter={formatTimestamp}
                  >
                    <AreaChart>
                      <Area type="monotone" dataKey={series[0].key} stroke="#888" fill="#262626" fillOpacity={0.4} />
                    </AreaChart>
                  </Brush>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <MetricLegend series={series} hidden={hidden} onToggle={toggleSeries} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════
   ChainOptimizerChart
   ═══════════════════════════════════════════════ */

export function ChainOptimizerChart({ specId }: { specId: string }) {
  const [days, setDays] = useState(7);
  const [consumer, setConsumer] = useState("all");
  const [metric, setMetric] = useState("selection_composite");
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const from = formatDateParam(daysAgo(days));
  const to = formatDateParam(new Date());

  const params = new URLSearchParams({ from, to, consumer });
  const { data, isLoading } = useApi<SpecResponse>(`/specs/${specId}/optimizer-metrics?${params}`);

  const topProviders = useMemo(() => {
    if (!data?.providers) return [];
    return data.providers.slice(0, 10);
  }, [data]);

  const sortedConsumers = useMemo(() => {
    if (!data?.possibleConsumers) return [];
    return [...data.possibleConsumers].sort((a, b) => a.localeCompare(b));
  }, [data]);

  const chartData = useMemo(() => {
    if (!data?.metrics) return [];

    const byTime = new Map<string, Record<string, unknown>>();

    for (const m of data.metrics) {
      if (!topProviders.includes(m.provider)) continue;
      const value = m[metric as keyof OptimizerMetric];
      if (value == null) continue;

      const time = m.hourly_timestamp;
      if (!byTime.has(time)) byTime.set(time, { time });
      const entry = byTime.get(time)!;
      const label = m.provider.slice(0, 10);
      entry[label] = value;
    }

    return Array.from(byTime.values()).sort((a, b) => String(a.time).localeCompare(String(b.time)));
  }, [data, metric, topProviders]);

  const series: SeriesConfig[] = useMemo(() =>
    topProviders.map((p, i) => ({
      key: p.slice(0, 10),
      label: p.slice(0, 10) + "...",
      color: PROVIDER_COLORS[i % PROVIDER_COLORS.length],
    })),
  [topProviders]);

  const isUnavailable = !isLoading && data && "error" in data;

  const toggleSeries = useCallback((key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

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
      <CardHeader className="flex flex-col gap-4 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">Consumer Optimizer Metrics <ModeInfo mode={metric.startsWith("selection_") ? "wrs" : "scores"} /></CardTitle>
          <CardDescription>Provider performance as seen by consumers</CardDescription>
        </div>
        {!isUnavailable && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select value={metric} onChange={(e) => setMetric(e.target.value)} className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground">
              {metricOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {sortedConsumers.length > 1 && (
              <ConsumerDropdown consumers={sortedConsumers} selected={consumer} onChange={setConsumer} />
            )}
            <RangeButtons days={days} onChange={setDays} />
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isUnavailable ? <ChartUnavailable /> : isLoading ? <ChartLoading /> : chartData.length === 0 ? <ChartEmpty /> : (
          <>
            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 14.9%)" />
                  <XAxis
                    dataKey="time"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={32}
                    tick={{ fill: "#888", fontSize: 12 }}
                    tickFormatter={formatTimestamp}
                  />
                  <YAxis
                    tick={{ fill: "#888", fontSize: 12 }}
                    tickFormatter={(v: number) => v.toFixed(2)}
                  />
                  <Tooltip content={<ChartTooltip />} />

                  {series.map((s) =>
                    hidden.has(s.key) ? null : (
                      <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} dot={false} strokeWidth={2} />
                    )
                  )}

                  <Brush
                    dataKey="time"
                    height={30}
                    stroke="rgba(136, 136, 136, 0.3)"
                    fill="#0a0a0a"
                    travellerWidth={10}
                    tickFormatter={formatTimestamp}
                  >
                    <AreaChart>
                      <Area type="monotone" dataKey={series[0]?.key ?? "time"} stroke="#888" fill="#262626" fillOpacity={0.4} />
                    </AreaChart>
                  </Brush>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-3 mt-4">
              {series.map((s) => (
                <button
                  key={s.key}
                  onClick={() => toggleSeries(s.key)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded text-sm hover:bg-muted/50"
                  style={{ opacity: hidden.has(s.key) ? 0.35 : 1 }}
                >
                  <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
