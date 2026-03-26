const ULAVA_DECIMALS = 6;
const ULAVA_DIVISOR = 10 ** ULAVA_DECIMALS;

/** Convert ulava (micro-lava) to LAVA with proper decimal formatting */
export function ulavaToLava(ulava: bigint | number | string): string {
  const value = typeof ulava === "bigint" ? ulava : BigInt(ulava);
  const whole = value / BigInt(ULAVA_DIVISOR);
  const fraction = value % BigInt(ULAVA_DIVISOR);
  const fractionStr = fraction.toString().padStart(ULAVA_DECIMALS, "0").replace(/0+$/, "");
  return fractionStr ? `${whole}.${fractionStr}` : whole.toString();
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
