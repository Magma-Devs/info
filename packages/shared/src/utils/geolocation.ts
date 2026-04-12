/** Geolocation bitmask values used by Lava Network */
export const GEOLOCATION = {
  "US-Center": 0x1,
  "Europe": 0x2,
  "US-East": 0x4,
  "US-West": 0x8,
  "Africa": 0x10,
  "Asia": 0x20,
  "AU/NZ": 0x40,
} as const;

/** Decode a geolocation bitmask into a human-readable label */
export function geoLabel(geo?: number): string {
  if (geo == null || geo === 0) return "—";
  if (geo === 0xffff) return "Global";
  const regions: string[] = [];
  for (const [name, bit] of Object.entries(GEOLOCATION)) {
    if (geo & bit) regions.push(name);
  }
  return regions.length > 0 ? regions.join(", ") : String(geo);
}
