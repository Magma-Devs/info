import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartSkeleton } from "./ChartSkeleton";

interface ChartCardSkeletonProps {
  title?: string;
  description?: string;
  height?: number;
}

/** Full chart card placeholder (header + chart) for when the chart bundle is still loading. */
export function ChartCardSkeleton({ title, description, height = 350 }: ChartCardSkeletonProps) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 p-4 pb-4 md:p-6 md:pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          {title ? <CardTitle>{title}</CardTitle> : <Skeleton className="h-5 w-48 mb-1.5" />}
          {description ? <CardDescription>{description}</CardDescription> : <Skeleton className="h-3.5 w-72 max-w-full mt-1.5" />}
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-40" />
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
        <ChartSkeleton height={height} />
      </CardContent>
    </Card>
  );
}
