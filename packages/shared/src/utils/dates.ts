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

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses a YYYY-MM-DD string strictly as a UTC Date.
 * Rejects non-matching formats and calendar-invalid dates like 2025-02-30
 * (which `new Date()` would silently roll over to 2025-03-02).
 * Returns null on any parse failure.
 */
export function parseYMD(s: string): Date | null {
  const m = YMD_RE.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const ts = Date.UTC(y, mo - 1, d);
  const rt = new Date(ts);
  if (rt.getUTCFullYear() !== y || rt.getUTCMonth() !== mo - 1 || rt.getUTCDate() !== d) {
    return null;
  }
  return rt;
}
