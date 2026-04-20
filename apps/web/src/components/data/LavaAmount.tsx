"use client";

import { formatLava, formatLavaKMB } from "@/lib/format";

interface LavaAmountProps {
  amount: string | bigint | number;
  showDenom?: boolean;
}

/**
 * Displays a LAVA amount in compact K/M/B/T form on both mobile and desktop.
 * Hover (or long-press) reveals the exact LAVA value.
 */
export function LavaAmount({ amount, showDenom = true }: LavaAmountProps) {
  const denom = showDenom ? " LAVA" : "";
  const compactText = `${formatLavaKMB(amount)}${denom}`;
  const fullText = `${formatLava(amount)}${denom}`;

  return (
    <span
      title={fullText}
      className="cursor-help"
    >
      {compactText}
    </span>
  );
}
