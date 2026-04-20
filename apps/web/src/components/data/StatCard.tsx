import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value?: string | number | ReactNode;
  /** Exact value shown on hover (e.g. "1,234,567" when value shows "1.23M") */
  fullValue?: string;
  subtitle?: string;
  icon?: ReactNode;
  className?: string;
  tooltip?: string;
  /** When true, render a skeleton placeholder for the value */
  loading?: boolean;
}

export function StatCard({ label, value, fullValue, subtitle, icon, className, tooltip, loading }: StatCardProps) {
  return (
    <Card className={`w-full ${className ?? ""}`} title={tooltip}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </CardHeader>
      <CardContent className="min-w-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center h-8">
            <Loader2 className="h-5 w-5 text-muted-foreground/60 animate-spin" />
          </div>
        ) : (
          <div
            className="text-2xl font-bold whitespace-nowrap cursor-default max-w-full pr-1"
            title={fullValue}
          >
            {value}
          </div>
        )}
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
