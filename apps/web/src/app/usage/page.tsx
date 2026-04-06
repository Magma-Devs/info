"use client";

import { StatCard } from "@/components/data/StatCard";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function UsagePage() {
  return (
    <>
      <div style={{ marginLeft: "23px" }}>
        <h1 className="text-3xl font-bold mb-2">Usage & Reliability</h1>
        <p className="text-muted-foreground text-sm mb-6">
          Lava Network uptime and reliability metrics compared to traditional providers.
        </p>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-3 md:gap-8">
        <StatCard label="Lava Uptime" value="100%" subtitle="Past 90 days" />
        <StatCard label="Lava Total Incidents" value="0" subtitle="Past 90 days" />
        <StatCard label="Lava Reliability Score" value="A+" />
      </div>

      <div style={{ marginTop: "25px" }} />

      <Card>
        <CardHeader><CardTitle>Uptime Comparison</CardTitle></CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Usage and uptime comparison charts will be available once incident tracking data is integrated.
            This page displays Lava Network reliability metrics compared to traditional cloud providers.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
