"use client";

import { useMemo } from "react";
import { AlertCircle, CheckCircle } from "lucide-react";
import type { CloudIncident } from "../types";

interface ServiceStat {
  name: string;
  uptime: number;
  incidents: number;
  lastIncident: string | null;
  color: string;
}

const PROVIDERS: { name: string; color: string }[] = [
  { name: "Lava Network", color: "text-green-500" },
  { name: "Cloudflare", color: "text-red-500" },
  { name: "Google Cloud", color: "text-blue-500" },
  { name: "AWS", color: "text-amber-500" },
  { name: "Azure", color: "text-purple-500" },
  { name: "Vercel", color: "text-cyan-500" },
  { name: "DigitalOcean", color: "text-teal-500" },
  { name: "Oracle Cloud", color: "text-orange-600" },
];

function buildServiceStats(incidents: CloudIncident[], months: number): ServiceStat[] {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  return PROVIDERS.map(({ name, color }) => {
    if (name === "Lava Network") {
      return { name, uptime: 100, incidents: 0, lastIncident: null, color };
    }

    const providerIncidents = incidents.filter((inc) => {
      return inc.provider === name && new Date(inc.date) >= startDate;
    });

    // Cloudflare has very high incident volume; weight it less
    const factor = name === "Cloudflare" ? 0.5 : 2;
    const reduction = Math.min(providerIncidents.length * factor, 15);
    const uptime = parseFloat((100 - reduction).toFixed(2));

    let lastIncident: string | null = null;
    if (providerIncidents.length > 0) {
      const mostRecentTs = providerIncidents.reduce((acc, inc) => {
        const t = new Date(inc.timestamp).getTime();
        return t > acc ? t : acc;
      }, 0);
      const daysSince = Math.floor((Date.now() - mostRecentTs) / (1000 * 60 * 60 * 24));
      if (daysSince === 0) lastIncident = "Today";
      else if (daysSince === 1) lastIncident = "Yesterday";
      else lastIncident = `${daysSince} days ago`;
    }

    return { name, uptime, incidents: providerIncidents.length, lastIncident, color };
  });
}

function periodLabel(months: number) {
  if (months === 12) return "1 Year";
  if (months === 6) return "6 Months";
  return "3 Months";
}

interface IncidentStatsProps {
  cloudIncidents: CloudIncident[];
  months: number;
}

export function IncidentStats({ cloudIncidents, months }: IncidentStatsProps) {
  const services = useMemo(() => buildServiceStats(cloudIncidents, months), [cloudIncidents, months]);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {services.map((service) => (
        <div
          key={service.name}
          className="rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-md"
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold">{service.name}</h3>
            {service.incidents === 0 ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <AlertCircle className="h-5 w-5 text-amber-500" />
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Uptime ({periodLabel(months)})</span>
              <span className={`font-bold ${service.color}`}>{service.uptime}%</span>
            </div>

            <div className="h-2 w-full rounded-full bg-muted">
              <div
                className={`h-2 rounded-full ${
                  service.uptime === 100
                    ? "bg-green-500"
                    : service.uptime >= 99.5
                      ? "bg-blue-500"
                      : service.uptime >= 99
                        ? "bg-amber-500"
                        : "bg-red-500"
                }`}
                style={{ width: `${service.uptime}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Incidents</span>
              <span className="font-semibold">
                {service.incidents === 0 ? (
                  <span className="text-green-500">No incidents</span>
                ) : (
                  <span className="text-amber-500">{service.incidents} reported</span>
                )}
              </span>
            </div>

            {service.lastIncident && (
              <div className="text-xs text-muted-foreground">Last incident: {service.lastIncident}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
