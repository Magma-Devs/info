import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string | number | ReactNode;
  subtitle?: string;
  icon?: ReactNode;
  className?: string;
  tooltip?: string;
}

export function StatCard({ label, value, subtitle, icon, className, tooltip }: StatCardProps) {
  return (
    <Card className={`w-full ${className ?? ""}`} title={tooltip}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </CardHeader>
      <CardContent className="flex justify-start">
        <div
          className="text-2xl font-bold"
          style={{ display: "inline-block", textAlign: "left", whiteSpace: "nowrap" }}
        >
          {value}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
