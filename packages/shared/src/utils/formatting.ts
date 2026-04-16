const ULAVA_DECIMALS = 6;
const ULAVA_DIVISOR = 1_000_000n;

/**
 * Convert ulava (micro-lava) to LAVA as a decimal string (no trailing zeros).
 * Preserves full fractional precision by doing integer-divide + remainder,
 * so it handles supply-sized amounts (>2^53) correctly.
 *
 * Example: ulavaToLava("1500000") → "1.5"; ulavaToLava("1000000") → "1".
 */
export function ulavaToLava(ulava: bigint | number | string): string {
  const value = typeof ulava === "bigint" ? ulava : BigInt(String(ulava).replace(/ulava$/, ""));
  const whole = value / ULAVA_DIVISOR;
  const fraction = value % ULAVA_DIVISOR;
  const fractionStr = fraction.toString().padStart(ULAVA_DECIMALS, "0").replace(/0+$/, "");
  return fractionStr ? `${whole}.${fractionStr}` : whole.toString();
}

/**
 * Same as ulavaToLava but returns a Number (for arithmetic/formatting).
 * Accurate for amounts up to ~9 quadrillion LAVA, which is well beyond
 * any on-chain value we work with.
 */
export function ulavaToLavaNumber(ulava: bigint | number | string): number {
  const value = typeof ulava === "bigint" ? ulava : BigInt(String(ulava).replace(/ulava$/, ""));
  return Number(value / ULAVA_DIVISOR) + Number(value % ULAVA_DIVISOR) / 1_000_000;
}

/** Format a large number with commas */
export function formatNumber(n: number | bigint): string {
  return n.toLocaleString("en-US");
}

/** Shorten a lava address for display: lava@1abc...xyz */
export function shortenAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars + 5)}...${address.slice(-chars)}`;
}
