"use client";

import { useMemo } from "react";
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
import { BarChart3, Loader2 } from "lucide-react";
import { formatNumberKMB } from "@/lib/format";

/* ─── Types ─── */

interface TimeSeriesEntry {
  date: string;
  cu: string;
  relays: string;
  qosSync: number | null;
  qosAvailability: number | null;
  qosLatency: number | null;
}

interface ChainChartProps {
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
   ChainChart — Relays & CU for a single chain
   ═══════════════════════════════════════════════ */

export function ChainChart({
  data,
  isLoading,
  rangeDays,
  onRangeChange,
}: ChainChartProps) {
  const chartData = useMemo(() => {
    if (!data?.length) return [];
    return data
      .map((d) => ({
        date: d.date,
        relays: Number(d.relays),
        cu: Number(d.cu),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle>Relays &amp; CU</CardTitle>
          <CardDescription>
            Daily relay and compute unit volume
          </CardDescription>
        </div>
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
                  <linearGradient id="chainFillRelays" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ac4c39" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#ac4c39" stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id="chainFillCU" x1="0" y1="0" x2="0" y2="1">
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

                <YAxis
                  yAxisId="left"
                  orientation="left"
                  tick={{ fill: "#888", fontSize: 12 }}
                  tickFormatter={(v: number) => formatNumberKMB(v)}
                />

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
                  fill="url(#chainFillRelays)"
                />

                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="cu"
                  name="CU"
                  stroke="#81b29a"
                  fill="url(#chainFillCU)"
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
