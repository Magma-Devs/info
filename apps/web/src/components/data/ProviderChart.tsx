"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Brush,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BarChart3, Loader2, ChevronsUpDown } from "lucide-react";
import { formatNumberKMB } from "@/lib/format";
import { getChainIcon } from "@/lib/chain-icons";

/* ─── Types ─── */

interface TimeSeriesEntry {
  date: string;
  chainId: string;
  cu: string;
  relays: string;
  qosSync: number | null;
  qosAvailability: number | null;
  qosLatency: number | null;
}

interface ProviderChartProps {
  data: TimeSeriesEntry[] | undefined;
  isLoading: boolean;
  rangeDays: number;
  onRangeChange: (days: number) => void;
}

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
    <img
      src={getChainIcon(chainId)}
      alt=""
      className="w-4 h-4 rounded-sm shrink-0"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/* ─── Chain Multi-Select Combobox ─── */

function ChainCombobox({
  chains,
  selected,
  onToggle,
}: {
  chains: string[];
  selected: string[];
  onToggle: (chain: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = chains
    .filter((c) => c.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
  const count = selected.length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-[200px] bg-card border border-border rounded px-3 py-1.5 text-sm text-foreground hover:bg-muted/50"
      >
        <span className="truncate">
          {count > 0
            ? `${count} chain${count > 1 ? "s" : ""} selected`
            : "Select chains..."}
        </span>
        <ChevronsUpDown className="h-4 w-4 ml-2 opacity-50 shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 right-0 w-[220px] bg-card border border-border rounded-lg shadow-lg z-50 p-2">
          <input
            type="text"
            placeholder="Search chains..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-muted border border-border rounded px-2 py-1.5 text-sm text-foreground mb-2 outline-none"
          />
          <div className="max-h-[200px] overflow-y-auto">
            {filtered.map((chain) => (
              <label
                key={chain}
                className="flex items-center gap-2 p-1.5 text-sm cursor-pointer hover:bg-muted rounded"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(chain)}
                  onChange={() => onToggle(chain)}
                  className="accent-[#ac4c39] shrink-0"
                />
                <ChainIcon chainId={chain} />
                <span className="truncate">{chain}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Custom Tooltip ─── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  return (
    <div className="custom-tooltip">
      <p className="font-semibold text-sm mb-2">
        {new Date(label).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((entry: any) => (
        <p key={entry.dataKey} className="text-sm">
          <span
            className="inline-block w-3 h-3 rounded-full mr-2"
            style={{ backgroundColor: entry.color || entry.stroke }}
          />
          <span className="font-bold">{entry.name}</span>:{" "}
          <span className="font-mono">
            {Number(entry.value).toLocaleString()}
          </span>
        </p>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ProviderChart — Relays & CU with dual Y-axis
   ═══════════════════════════════════════════════ */

export function ProviderChart({
  data,
  isLoading,
  rangeDays,
  onRangeChange,
}: ProviderChartProps) {
  const [showAllChains, setShowAllChains] = useState(true);
  const [selectedChains, setSelectedChains] = useState<string[]>([]);

  const allChains = useMemo(() => {
    if (!data?.length) return [];
    const totals: Record<string, number> = {};
    for (const p of data) {
      totals[p.chainId] = (totals[p.chainId] || 0) + Number(p.relays);
    }
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c);
  }, [data]);

  // Pivot: one row per date with total relays + total CU
  const chartData = useMemo(() => {
    if (!data?.length) return [];

    const activeChains =
      !showAllChains && selectedChains.length > 0
        ? new Set(selectedChains)
        : null;

    const byDay = new Map<string, { date: string; relays: number; cu: number }>();

    for (const p of data) {
      if (activeChains && !activeChains.has(p.chainId)) continue;
      const relays = Number(p.relays);
      const cu = Number(p.cu);
      const existing = byDay.get(p.date);
      if (existing) {
        existing.relays += relays;
        existing.cu += cu;
      } else {
        byDay.set(p.date, { date: p.date, relays, cu });
      }
    }

    return Array.from(byDay.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
  }, [data, showAllChains, selectedChains]);

  const toggleChain = useCallback((chain: string) => {
    setSelectedChains((prev) =>
      prev.includes(chain)
        ? prev.filter((c) => c !== chain)
        : [...prev, chain],
    );
  }, []);

  const handleAllChainsChange = useCallback((checked: boolean) => {
    setShowAllChains(checked);
    if (checked) setSelectedChains([]);
  }, []);

  // Custom legend
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderLegend = useCallback((props: any) => {
    const entries = props?.payload;
    if (!entries) return null;
    return (
      <div className="flex flex-wrap justify-center gap-4 text-sm">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {entries.map((entry: any, i: number) => (
          <div key={i} className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span>{entry.value}</span>
          </div>
        ))}
      </div>
    );
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle>Relays &amp; CU</CardTitle>
          <CardDescription>
            Daily relay and compute unit volume
          </CardDescription>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="provAllChains"
              checked={showAllChains}
              onChange={(e) => handleAllChainsChange(e.target.checked)}
              className="accent-[#ac4c39]"
            />
            <label
              htmlFor="provAllChains"
              className="text-sm font-medium whitespace-nowrap cursor-pointer"
            >
              All Chains
            </label>
          </div>
          <ChainCombobox
            chains={allChains}
            selected={selectedChains}
            onToggle={toggleChain}
          />
          <div className="flex gap-1">
            {[
              { label: "30d", days: 30 },
              { label: "90d", days: 90 },
              { label: "1y", days: 365 },
              { label: "All", days: 0 },
            ].map((r) => (
              <button
                key={r.label}
                onClick={() => onRangeChange(r.days)}
                className={`px-2 py-1 text-xs rounded ${
                  rangeDays === r.days
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted border border-border"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col items-center justify-center text-muted-foreground h-[350px]">
            <Loader2 className="h-8 w-8 mb-3 opacity-30 animate-spin" />
            <span className="text-sm">Loading chart data...</span>
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-muted-foreground h-[350px]">
            <BarChart3 className="h-10 w-10 mb-3 opacity-20" />
            <span className="text-sm">No chart data available</span>
            <span className="text-xs opacity-60 mt-1">
              Requires indexer connection
            </span>
          </div>
        ) : (
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
              >
                <defs>
                  <linearGradient id="fillRelays" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ac4c39" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#ac4c39" stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id="fillCU" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#81b29a" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#81b29a" stopOpacity={0.1} />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(0 0% 14.9%)"
                />

                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={32}
                  tick={{ fill: "#888", fontSize: 12 }}
                  tickFormatter={(v) =>
                    new Date(v).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  }
                />

                {/* Left Y-axis: Relays */}
                <YAxis
                  yAxisId="left"
                  orientation="left"
                  tick={{ fill: "#888", fontSize: 12 }}
                  tickFormatter={(v: number) => formatNumberKMB(v)}
                />

                {/* Right Y-axis: CU */}
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: "#888", fontSize: 12 }}
                  tickFormatter={(v: number) => formatNumberKMB(v)}
                />

                <Tooltip content={<ChartTooltip />} />
                <Legend content={renderLegend} />

                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="relays"
                  name="Relays"
                  stroke="#ac4c39"
                  fill="url(#fillRelays)"
                />

                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="cu"
                  name="CU"
                  stroke="#81b29a"
                  fill="url(#fillCU)"
                />

                <Brush
                  dataKey="date"
                  height={30}
                  stroke="rgba(136, 136, 136, 0.3)"
                  fill="#0a0a0a"
                  travellerWidth={10}
                  tickFormatter={(v: string) =>
                    new Date(v).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  }
                >
                  <AreaChart>
                    <Area
                      type="monotone"
                      dataKey="relays"
                      stroke="#888"
                      fill="#262626"
                      fillOpacity={0.4}
                    />
                  </AreaChart>
                </Brush>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
