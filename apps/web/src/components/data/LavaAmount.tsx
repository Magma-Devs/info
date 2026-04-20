"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatLava, formatLavaKMB, formatNumber } from "@/lib/format";

interface LavaAmountProps {
  amount: string | bigint | number;
  showDenom?: boolean;
}

/**
 * Displays a LAVA amount that adapts to its container width.
 * Shows the full formatted number when there's room; collapses to
 * K/M/B/T shorthand if the full string would overflow the parent.
 * Hover (or long-press on touch) reveals the exact ulava value.
 */
export function LavaAmount({ amount, showDenom = true }: LavaAmountProps) {
  const denom = showDenom ? " LAVA" : "";
  const fullText = `${formatLava(amount)}${denom}`;
  const compactText = `${formatLavaKMB(amount)}${denom}`;
  const raw = String(amount);

  const wrapperRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [useCompact, setUseCompact] = useState(false);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const measure = measureRef.current;
    if (!wrapper || !measure) return;

    const check = () => {
      const parent = wrapper.parentElement;
      if (!parent) return;
      // Available width = parent's content box, minus a small buffer so we
      // switch to compact a few pixels early (avoids border-clip on edge cases).
      const available = parent.clientWidth - 6;
      // Natural width of the full text (measured from a hidden duplicate).
      const needed = measure.scrollWidth;
      if (available > 0 && needed > 0) setUseCompact(needed > available);
    };

    check();
    const parent = wrapper.parentElement;
    if (!parent) return;
    const ro = new ResizeObserver(check);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [fullText]);

  // Re-measure on font load (digit widths can shift between fallback and webfont)
  useEffect(() => {
    if (typeof document === "undefined" || !document.fonts) return;
    const handler = () => {
      const wrapper = wrapperRef.current;
      const measure = measureRef.current;
      if (!wrapper || !measure) return;
      const parent = wrapper.parentElement;
      if (!parent) return;
      setUseCompact(measure.scrollWidth > parent.clientWidth - 6);
    };
    document.fonts.ready.then(handler);
  }, []);

  return (
    <>
      <span
        ref={wrapperRef}
        title={`${formatNumber(raw)} ulava`}
        className="cursor-help"
      >
        {useCompact ? compactText : fullText}
      </span>
      {/* Off-screen measurement element — has the full text so we can detect overflow without flip-flopping */}
      <span
        ref={measureRef}
        aria-hidden="true"
        className="absolute -left-[9999px] top-0 whitespace-nowrap pointer-events-none"
      >
        {fullText}
      </span>
    </>
  );
}
