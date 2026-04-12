"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
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

/* ─── Constants ─── */

const CHAIN_COLORS = [
  "#ff4d4d", "#33cc33", "#6666ff", "#e6e600", "#ff4dff",
  "#33cccc", "#ffa64d", "#9966ff", "#33cc99", "#ff4da6",
  "#cc9933", "#6699ff", "#cc33cc", "#99cc33", "#ff6633",
];

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

/* ─── Chain Icon (with fallback) ─── */

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

  const filtered = chains.filter((c) =>
    c.toLowerCase().includes(search.toLowerCase()),
  );
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

/* ═══════════════════════════════════════════════
   IndexChart — main component
   ═══════════════════════════════════════════════ */

export function IndexChart({
  data,
  isLoading,
  rangeDays,
  onRangeChange,
}: IndexChartProps) {
  const [showAllChains, setShowAllChains] = useState(true);
  const [selectedChains, setSelectedChains] = useState<string[]>([]);

  // Sort chains by total relays desc, assign colors
  const { allChains, chainColors } = useMemo(() => {
    if (!data?.length)
      return {
        allChains: [] as string[],
        chainColors: {} as Record<string, string>,
      };
    const totals: Record<string, number> = {};
    for (const p of data) {
      totals[p.chainId] = (totals[p.chainId] || 0) + Number(p.relays);
    }
    const sorted = Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c);
    const colors: Record<string, string> = {};
    sorted.forEach((chain, i) => {
      colors[chain] = CHAIN_COLORS[i % CHAIN_COLORS.length];
    });
    return { allChains: sorted, chainColors: colors };
  }, [data]);

  // Pivot data: one row per date with totalRelays + per-chain columns + combined QoS
  const chartData = useMemo(() => {
    if (!data?.length) return [];

    const byDay = new Map<string, Record<string, number | string | null>>();

    for (const p of data) {
      const relays = Number(p.relays);
      const existing = byDay.get(p.date);

      if (existing) {
        existing[p.chainId] =
          ((existing[p.chainId] as number) || 0) + relays;
        (existing as Record<string, number>).totalRelays += relays;
        if (p.qosSync != null) {
          (existing as Record<string, number>)._qSW +=
            (p.qosSync ?? 0) * relays;
          (existing as Record<string, number>)._qAW +=
            (p.qosAvailability ?? 0) * relays;
          (existing as Record<string, number>)._qLW +=
            (p.qosLatency ?? 0) * relays;
          (existing as Record<string, number>)._w += relays;
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
  }, [data]);

  // Areas to render: "All Chains" aggregate OR individual chains
  const areasToRender = useMemo(() => {
    const areas: { key: string; color: string; label: string }[] = [];
    if (showAllChains) {
      areas.push({
        key: "totalRelays",
        color: ALL_CHAINS_COLOR,
        label: "All Chains",
      });
    }
    for (const chain of selectedChains) {
      areas.push({
        key: chain,
        color: chainColors[chain] || "#888",
        label: chain,
      });
    }
    if (areas.length === 0) {
      areas.push({
        key: "totalRelays",
        color: ALL_CHAINS_COLOR,
        label: "All Chains",
      });
    }
    return areas;
  }, [showAllChains, selectedChains, chainColors]);

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
        {entries.map((entry: any, i: number) => {
          const isQos = entry.dataKey === "qos";
          return (
            <div key={i} className="flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-3 rounded-full"
                style={{
                  backgroundColor: isQos ? "#00ff00" : entry.color,
                }}
              />
              <span>{entry.value}</span>
            </div>
          );
        })}
      </div>
    );
  }, []);

  /* ─── Render ─── */

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <CardTitle>QoS Score and Selected Chains</CardTitle>
          <CardDescription>
            Showing QoS score and relay counts for selected chains
          </CardDescription>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="allChains"
              checked={showAllChains}
              onChange={(e) => handleAllChainsChange(e.target.checked)}
              className="accent-[#ac4c39]"
            />
            <label
              htmlFor="allChains"
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
                  {areasToRender.map(({ key, color }) => (
                    <linearGradient
                      key={key}
                      id={`fill-${key}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor={color}
                        stopOpacity={0.8}
                      />
                      <stop
                        offset="95%"
                        stopColor={color}
                        stopOpacity={0.1}
                      />
                    </linearGradient>
                  ))}
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
                  tick={{ fill: "#888", fontSize: 12 }}
                />

                <Tooltip content={<ChartTooltip />} />
                <Legend content={renderLegend} />

                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="qos"
                  name="QoS Score"
                  stroke="url(#qosGradient)"
                  strokeWidth={2}
                  dot={false}
                />

                {areasToRender.map(({ key, color, label }) => (
                  <Area
                    key={key}
                    yAxisId="left"
                    type="monotone"
                    dataKey={key}
                    name={label}
                    stroke={color}
                    fill={`url(#fill-${key})`}
                    stackId="chains"
                  />
                ))}

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
        )}
      </CardContent>
    </Card>
  );
}
