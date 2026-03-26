const STATUS_COLORS: Record<string, string> = {
  healthy: "bg-green-900/50 text-green-400 border-green-800",
  active: "bg-green-900/50 text-green-400 border-green-800",
  unhealthy: "bg-red-900/50 text-destructive border-red-800",
  frozen: "bg-blue-900/50 text-accent border-blue-800",
  jailed: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
  unstaking: "bg-orange-900/50 text-orange-400 border-orange-800",
};

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status.toLowerCase()] ?? "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${color}`}>
      {status}
    </span>
  );
}
