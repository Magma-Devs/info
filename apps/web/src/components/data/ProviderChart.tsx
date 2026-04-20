"use client";

import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Brush,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import { formatNumberKMB } from "@/lib/format";
import { ChainSelect } from "./ChainSelect";
import { ChartSkeleton } from "./ChartSkeleton";

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
  const [selectedChain, setSelectedChain] = useState("all");

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

    const byDay = new Map<string, { date: string; relays: number; cu: number }>();

    for (const p of data) {
      if (selectedChain !== "all" && p.chainId !== selectedChain) continue;
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
  }, [data, selectedChain]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 p-4 pb-4 md:p-6 md:pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle>Relays &amp; CU</CardTitle>
          <CardDescription>
            Daily relay and compute unit volume
          </CardDescription>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-2">
          <ChainSelect chains={allChains} selected={selectedChain} onChange={setSelectedChain} />
          <div className="flex gap-1 w-full md:w-auto">
            {[
              { label: "30d", days: 30 },
              { label: "90d", days: 90 },
              { label: "1y", days: 365 },
              { label: "All", days: 0 },
            ].map((r) => (
              <button
                key={r.label}
                onClick={() => onRangeChange(r.days)}
                className={`flex-1 md:flex-none px-3 py-2 md:py-1 text-sm md:text-xs rounded transition-colors ${
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
      <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
        {isLoading ? (
          <ChartSkeleton />
        ) : chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-muted-foreground h-[350px]">
            <BarChart3 className="h-10 w-10 mb-3 opacity-20" />
            <span className="text-sm">No chart data available</span>
            <span className="text-xs opacity-60 mt-1">
              Requires indexer connection
            </span>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap justify-center gap-4 text-sm mb-3">
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: "#ac4c39" }} />
                <span>Relays</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: "#81b29a" }} />
                <span>CU</span>
              </div>
            </div>
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
          </>
        )}
      </CardContent>
    </Card>
  );
}
