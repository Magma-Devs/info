"use client";

import { useState, useMemo, useEffect } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
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
import { ChainSelect } from "./ChainSelect";

/* ─── Constants ─── */

const ALL_CHAINS_COLOR = "#8b5cf6";

/* ─── Types ─── */

interface ChartPoint {
  date: string;
  chainId: string;
  cu: string;
  relays: string;
  qosSync: number | null;
  qosAvailability: number | null;
  qosLatency: number | null;
}

interface IndexChartProps {
  data: ChartPoint[] | undefined;
  isLoading: boolean;
  rangeDays: number;
  onRangeChange: (days: number) => void;
}

/* ─── Helpers ─── */

function getQoSColor(score: number): string {
  if (score >= 0.99) return "#00ff00";
  if (score >= 0.97) return "#ffff00";
  return "#ff0000";
}

/* ─── Custom Tooltip ─── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qosEntry = payload.find((p: any) => p.dataKey === "qos");
  const qos: number | undefined = qosEntry?.value;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const areaEntries = payload.filter((p: any) => p.dataKey !== "qos");

  return (
    <div className="custom-tooltip">
      <p className="font-semibold text-sm mb-2">
        {new Date(label).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </p>
      {qos != null && (
        <p className="text-sm">
          <span
            className="inline-block w-3 h-3 rounded-full mr-2"
            style={{ backgroundColor: getQoSColor(qos) }}
          />
          <span className="font-bold">QoS Score:</span> {qos.toFixed(4)}
        </p>
      )}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {areaEntries.map((entry: any) => (
        <p key={entry.dataKey} className="text-sm">
          <span
            className="inline-block w-3 h-3 rounded-full mr-2"
            style={{ backgroundColor: entry.color || entry.stroke }}
          />
          <span className="font-bold">{entry.name}</span>:{" "}
          <span className="font-mono">
            {Number(entry.value).toLocaleString()}
          </span>{" "}
          Relays
        </p>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   IndexChart — main component
   ═══════════════════════════════════════════════ */

export function IndexChart({
  data,
  isLoading,
  rangeDays,
  onRangeChange,
}: IndexChartProps) {
  const [selectedChain, setSelectedChain] = useState("all");
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Sort chains by total relays desc
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

  // Pivot data: one row per date with totalRelays + per-chain columns + combined QoS
  const chartData = useMemo(() => {
    if (!data?.length) return [];

    const byDay = new Map<string, Record<string, number | string | null>>();

    for (const p of data) {
      if (selectedChain !== "all" && p.chainId !== selectedChain) continue;
      const relays = Number(p.relays);
      const existing = byDay.get(p.date);

      if (existing) {
        const rec = existing as Record<string, number>;
        existing[p.chainId] = (Number(existing[p.chainId]) || 0) + relays;
        rec.totalRelays = (rec.totalRelays ?? 0) + relays;
        if (p.qosSync != null) {
          rec._qSW = (rec._qSW ?? 0) + (p.qosSync ?? 0) * relays;
          rec._qAW = (rec._qAW ?? 0) + (p.qosAvailability ?? 0) * relays;
          rec._qLW = (rec._qLW ?? 0) + (p.qosLatency ?? 0) * relays;
          rec._w = (rec._w ?? 0) + relays;
        }
      } else {
        byDay.set(p.date, {
          date: p.date,
          [p.chainId]: relays,
          totalRelays: relays,
          _qSW: (p.qosSync ?? 0) * relays,
          _qAW: (p.qosAvailability ?? 0) * relays,
          _qLW: (p.qosLatency ?? 0) * relays,
          _w: p.qosSync != null ? relays : 0,
        });
      }
    }

    return Array.from(byDay.values())
      .sort((a, b) => (a.date as string).localeCompare(b.date as string))
      .map((d) => {
        const w = d._w as number;
        const sync = w > 0 ? (d._qSW as number) / w : null;
        const avail = w > 0 ? (d._qAW as number) / w : null;
        const lat = w > 0 ? (d._qLW as number) / w : null;
        const qos =
          sync != null && avail != null && lat != null
            ? Math.pow(sync * avail * lat, 1 / 3)
            : null;

        const result: Record<string, unknown> = { ...d, qos };
        delete result._qSW;
        delete result._qAW;
        delete result._qLW;
        delete result._w;
        return result;
      });
  }, [data, selectedChain]);

  const areaConfig = useMemo(() => {
    if (selectedChain === "all") {
      return { key: "totalRelays", color: ALL_CHAINS_COLOR, label: "All Chains" };
    }
    return { key: selectedChain, color: ALL_CHAINS_COLOR, label: selectedChain };
  }, [selectedChain]);

  /* ─── Render ─── */

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 p-4 pb-4 md:p-6 md:pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle>QoS Score and Selected Chains</CardTitle>
          <CardDescription>
            Showing QoS score and relay counts for selected chains
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
            {/* Static legend — rendered outside the chart to avoid recharts layout conflicts */}
            <div className="flex flex-wrap justify-center gap-4 text-sm mb-3">
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: "#00ff00" }} />
                <span>QoS Score</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: areaConfig.color }} />
                <span>{areaConfig.label}</span>
              </div>
            </div>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={isMobile
                  ? { top: 12, right: 4, bottom: 8, left: 0 }
                  : { top: 20, right: 20, bottom: 20, left: 20 }}
              >
                <defs>
                  <linearGradient
                    id="qosGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="#00ff00"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor="#ff0000"
                      stopOpacity={0.8}
                    />
                  </linearGradient>
                  <linearGradient
                    id={`fill-${areaConfig.key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={areaConfig.color}
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor={areaConfig.color}
                      stopOpacity={0.1}
                    />
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
                  domain={[0, 1]}
                  hide={isMobile}
                  tick={{ fill: "#888", fontSize: 12 }}
                />

                <Tooltip content={<ChartTooltip />} />

                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="qos"
                  name="QoS Score"
                  stroke="url(#qosGradient)"
                  strokeWidth={2}
                  dot={false}
                />

                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey={areaConfig.key}
                  name={areaConfig.label}
                  stroke={areaConfig.color}
                  fill={`url(#fill-${areaConfig.key})`}
                />

                <Brush
                  dataKey="date"
                  height={isMobile ? 40 : 30}
                  stroke="rgba(136, 136, 136, 0.3)"
                  fill="#0a0a0a"
                  travellerWidth={isMobile ? 20 : 10}
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
                      dataKey="totalRelays"
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
