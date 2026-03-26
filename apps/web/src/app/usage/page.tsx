"use client";

import { StatCard } from "@/components/data/StatCard";

export default function UsagePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Usage & Uptime Metrics</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Lava Uptime" value="100%" subtitle="Past 90 days" />
        <StatCard label="Incidents" value="0" subtitle="Past 90 days" />
        <StatCard label="Reliability Score" value="A+" />
      </div>

      <div className="rounded-xl border border-border bg-card shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Uptime Comparison</h2>
        <p className="text-muted-foreground text-sm">
          Usage and uptime comparison charts will be available once incident tracking data is integrated.
          This page displays Lava Network reliability metrics compared to traditional cloud providers.
        </p>
      </div>
    </div>
  );
}
