"use client";

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
} from "recharts";

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
}

/**
 * THE one chart component. Built on Recharts.
 * Replaces: IndexChart, ProviderChart, ConsumerChart, ChainChart (all nearly identical).
 */
export function Chart({ data, series, xKey, height = 300, isLoading }: ChartProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center text-muted-foreground" style={{ height }}>
        Loading chart...
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-muted-foreground" style={{ height }}>
        No chart data
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
        <Legend />
        {series.map((s) =>
          s.type === "area" ? (
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
          ),
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
