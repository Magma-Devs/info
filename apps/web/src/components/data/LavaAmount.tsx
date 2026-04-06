"use client";

import { formatLava, formatNumber } from "@/lib/format";

interface LavaAmountProps {
  amount: string | bigint | number;
  showDenom?: boolean;
}

/** Displays a LAVA amount with tooltip showing ULAVA */
export function LavaAmount({ amount, showDenom = true }: LavaAmountProps) {
  const formatted = formatLava(amount);
  const raw = String(amount);
  return (
    <span title={`${formatNumber(raw)} ulava`} className="cursor-help">
      {formatted}{showDenom ? " LAVA" : ""}
    </span>
  );
}
