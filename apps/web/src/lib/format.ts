/** Format number with thousand separators */
export function formatNumber(value: number | string | bigint): string {
  const n = typeof value === "bigint" ? Number(value) : Number(value);
  if (isNaN(n)) return "0";
  return new Intl.NumberFormat("en-US").format(n);
}

/** Format large numbers with K/M/B suffix */
export function formatNumberKMB(value: number | string): string {
  const n = Number(value);
  if (isNaN(n)) return "0";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(0);
}

/** Convert ulava to LAVA with formatting */
export function formatLava(ulava: string | bigint | number): string {
  try {
    const value = typeof ulava === "bigint" ? ulava : BigInt(String(ulava).replace(/ulava$/, ""));
    const lava = Number(value / BigInt(1e6));
    return new Intl.NumberFormat("en-US").format(lava);
  } catch {
    return "0";
  }
}

/** Format time difference as relative string */
export function formatTimeDifference(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}min ago`;
  if (diffHr < 24) return `${diffHr}hrs ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Check if text is meaningful (not null, undefined, n/a, etc.) */
export function isMeaningfulText(text: string | null | undefined): boolean {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  return !["null", "undefined", "n/a", "na", "none", ""].includes(lower);
}
