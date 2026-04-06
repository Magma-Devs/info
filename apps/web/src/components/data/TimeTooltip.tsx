"use client";

import { formatTimeDifference } from "@/lib/format";

interface TimeTooltipProps {
  datetime: Date | string;
}

/** Shows relative time with full date tooltip */
export function TimeTooltip({ datetime }: TimeTooltipProps) {
  const d = typeof datetime === "string" ? new Date(datetime) : datetime;
  const relative = formatTimeDifference(d);
  const full = d.toLocaleString();

  return (
    <span title={full} className="cursor-help text-muted-foreground">
      {relative}
    </span>
  );
}
