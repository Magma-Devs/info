"use client";

import { useId } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface ChartSkeletonProps {
  /** Height in pixels (default 350) */
  height?: number;
}

/**
 * Animated chart-shaped placeholder. Renders an SVG area-chart silhouette
 * with grid, axis ticks, and a moving shimmer inside the fill — plus a
 * ghost line on top. Much nicer than flat skeleton bars.
 */
export function ChartSkeleton({ height = 350 }: ChartSkeletonProps) {
  const id = useId();
  const gradId = `skel-grad-${id}`;
  const shimmerId = `skel-shim-${id}`;
  const clipId = `skel-clip-${id}`;

  // A smooth area curve — Bézier path for organic look
  const areaPath =
    "M 0,130 C 30,118 55,95 85,98 C 115,101 135,75 165,68 C 195,61 215,85 245,82 C 275,79 300,55 330,52 C 355,50 380,62 400,58 L 400,180 L 0,180 Z";
  const linePath =
    "M 0,50 C 40,42 70,60 110,55 C 150,50 180,30 220,38 C 260,46 290,28 330,32 C 365,36 390,28 400,30";

  return (
    <div className="w-full" style={{ height }}>
      <div className="flex h-full w-full gap-3">
        {/* Y axis tick labels */}
        <div className="flex flex-col justify-between py-1 shrink-0">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-2.5 w-8" />
          ))}
        </div>

        {/* Chart area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 relative">
            <svg
              viewBox="0 0 400 180"
              preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full overflow-visible"
            >
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
                </linearGradient>
                <linearGradient id={shimmerId} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
                  <stop offset="50%" stopColor="currentColor" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                  <animate
                    attributeName="x1"
                    values="-1;1"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="x2"
                    values="0;2"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                </linearGradient>
                <clipPath id={clipId}>
                  <path d={areaPath} />
                </clipPath>
              </defs>

              {/* Dashed grid lines */}
              <g className="text-muted-foreground/20" stroke="currentColor" strokeDasharray="2 4">
                {[36, 72, 108, 144].map((y) => (
                  <line key={y} x1="0" y1={y} x2="400" y2={y} />
                ))}
              </g>

              {/* Filled area */}
              <g className="text-muted-foreground">
                <path d={areaPath} fill={`url(#${gradId})`} />
                {/* Shimmer sweep — clipped to the area shape */}
                <rect
                  x="0"
                  y="0"
                  width="400"
                  height="180"
                  fill={`url(#${shimmerId})`}
                  clipPath={`url(#${clipId})`}
                />
              </g>

              {/* Top line on the area */}
              <path
                d={areaPath.split(" L ")[0]}
                className="text-muted-foreground/50"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
              />

              {/* Secondary ghost line (like a QoS line) */}
              <path
                d={linePath}
                className="text-muted-foreground/30"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeDasharray="3 3"
                fill="none"
              />
            </svg>
          </div>

          {/* X axis tick labels */}
          <div className="flex justify-between gap-2 pt-2">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-2.5 w-10" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
