import { cn } from "@/lib/cn";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "destructive" | "outline";
}

const variants: Record<string, string> = {
  default: "bg-accent-bg text-accent border-accent-line",
  success: "bg-green-900/50 text-green-400 border-green-800",
  warning: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
  destructive: "bg-red-900/50 text-red-400 border-red-800",
  outline: "bg-transparent text-muted-foreground border-border",
};

export function Badge({ variant = "default", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
