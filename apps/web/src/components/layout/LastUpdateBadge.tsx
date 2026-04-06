"use client";

import { useApi } from "@/hooks/use-api";
import { formatTimeDifference } from "@/lib/format";

interface HealthStatus {
  status: string;
  components: { latestBlock: number; latestBlockTime: string };
}

export function LastUpdateBadge() {
  const { data } = useApi<HealthStatus>("/health/status");

  if (!data?.components?.latestBlockTime) return null;

  const time = formatTimeDifference(data.components.latestBlockTime);
  const block = data.components.latestBlock;

  return (
    <span
      className="text-xs text-muted-foreground border border-border rounded px-2 py-1 whitespace-nowrap"
      title={`Block ${block} — ${new Date(data.components.latestBlockTime).toLocaleString()}`}
    >
      #{block} · {time}
    </span>
  );
}
