"use client";

import { useState, useCallback } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Brush,
} from "recharts";
import { BarChart3 } from "lucide-react";
import { ChartSkeleton } from "./ChartSkeleton";

interface ChartSeries {
  key: string;
  label: string;
  color: string;
  type?: "line" | "area";
}

interface ChartProps {
  data: Record<string, unknown>[];
  series: ChartSeries[];
  xKey: string;
  height?: number;
  isLoading?: boolean;
  brushable?: boolean;
  toggleable?: boolean;
}

/**
 * THE one chart component. Built on Recharts.
 * Replaces: IndexChart, ProviderChart, ConsumerChart, ChainChart (all nearly identical).
 */
export function Chart({ data, series, xKey, height = 300, isLoading, brushable = false, toggleable = false }: ChartProps) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleLegendClick = useCallback((entry: any) => {
    if (!toggleable || entry?.dataKey == null) return;
    const key = String(entry.dataKey);
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, [toggleable]);

  if (isLoading) {
    return <ChartSkeleton height={height} />;
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-muted-foreground" style={{ height }}>
        <BarChart3 className="h-10 w-10 mb-3 opacity-20" />
        <span className="text-sm">No chart data available</span>
        <span className="text-xs opacity-60 mt-1">Requires indexer connection</span>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
        <XAxis
          dataKey={xKey}
          tick={{ fill: "#888", fontSize: 12 }}
          tickFormatter={(v) => {
            if (typeof v === "string" && v.includes("-")) {
              return new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" });
            }
            return String(v);
          }}
        />
        <YAxis tick={{ fill: "#888", fontSize: 12 }} />
        <Tooltip
          contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: 8 }}
          labelStyle={{ color: "#aaa" }}
        />
        <Legend
          onClick={toggleable ? handleLegendClick : undefined}
          formatter={(value, entry) => {
            const isHidden = toggleable && "dataKey" in entry && hidden.has(entry.dataKey as string);
            return <span style={{ opacity: isHidden ? 0.3 : 1, cursor: toggleable ? "pointer" : undefined }}>{value}</span>;
          }}
        />
        {series.map((s) => {
          if (toggleable && hidden.has(s.key)) return null;
          return s.type === "area" ? (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              fill={s.color}
              fillOpacity={0.1}
            />
          ) : (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              dot={false}
            />
          );
        })}
        {brushable && <Brush dataKey={xKey} height={30} stroke="#ac4c39" />}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
