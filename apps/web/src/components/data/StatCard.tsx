import { Card, CardHeader, CardContent } from "@/components/ui/card";
import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string | number | ReactNode;
  subtitle?: string;
  icon?: ReactNode;
}

export function StatCard({ label, value, subtitle, icon }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="text-sm font-medium text-muted-foreground">{label}</div>
        {icon && <div className="h-4 w-4 text-muted-foreground">{icon}</div>}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
