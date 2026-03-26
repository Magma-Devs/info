import { format } from "date-fns";

/** Format a date as ISO-like string: "2024-01-15 14:30:00" */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "yyyy-MM-dd HH:mm:ss");
}

/** Format a date as short date: "Jan 15, 2024" */
export function formatShortDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "MMM d, yyyy");
}
