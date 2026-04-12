import { describe, it, expect } from "vitest";

// These are internal functions — import via re-export or test indirectly.
// Since they're not exported, we replicate them here for unit testing.
// Keep in sync with rpc/lava.ts.

function formatTokenStr(s: string): string {
  const [whole, frac] = s.split(".");
  if (!frac) return whole;
  const trimmed = frac.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

function divideByFactor(raw: string, factor: number): string {
  const cleaned = formatTokenStr(raw);
  const digits = Math.round(Math.log10(factor));
  const [intPart, decPart = ""] = cleaned.split(".");
  const combined = intPart + decPart;
  const shiftedDecPos = combined.length - digits - decPart.length;

  const padded = shiftedDecPos <= 0
    ? "0." + "0".repeat(-shiftedDecPos) + combined
    : combined.slice(0, shiftedDecPos) + "." + combined.slice(shiftedDecPos);

  return formatTokenStr(padded || "0");
}

describe("formatTokenStr", () => {
  it("strips trailing zeros from decimal", () => {
    expect(formatTokenStr("23.550000")).toBe("23.55");
  });

  it("strips all-zero decimal part", () => {
    expect(formatTokenStr("100.000000000000000000")).toBe("100");
  });

  it("returns whole numbers unchanged", () => {
    expect(formatTokenStr("42")).toBe("42");
  });

  it("preserves significant decimal digits", () => {
    expect(formatTokenStr("1.23456")).toBe("1.23456");
  });

  it("handles zero", () => {
    expect(formatTokenStr("0")).toBe("0");
    expect(formatTokenStr("0.000000")).toBe("0");
  });
});

describe("divideByFactor", () => {
  it("divides standard ulava amount by 1e6", () => {
    expect(divideByFactor("23584370", 1_000_000)).toBe("23.58437");
  });

  it("handles RPC amounts with 18 trailing decimal zeros", () => {
    expect(divideByFactor("23584370.000000000000000000", 1_000_000)).toBe("23.58437");
  });

  it("handles zero", () => {
    expect(divideByFactor("0", 1_000_000)).toBe("0");
    expect(divideByFactor("0.000000000000000000", 1_000_000)).toBe("0");
  });

  it("handles sub-unit amounts (amount < factor)", () => {
    expect(divideByFactor("500", 1_000_000)).toBe("0.0005");
    expect(divideByFactor("1", 1_000_000)).toBe("0.000001");
  });

  it("handles amount equal to factor", () => {
    expect(divideByFactor("1000000", 1_000_000)).toBe("1");
  });

  it("handles 1e18 factor (atto denoms)", () => {
    expect(divideByFactor("1000000000000000000", 1e18)).toBe("1");
    expect(divideByFactor("500000000000000000", 1e18)).toBe("0.5");
  });

  it("handles 1e8 factor (basecro)", () => {
    expect(divideByFactor("100000000", 1e8)).toBe("1");
    expect(divideByFactor("12345678", 1e8)).toBe("0.12345678");
  });

  it("handles 1e7 factor (unit-move)", () => {
    expect(divideByFactor("10000000", 1e7)).toBe("1");
    expect(divideByFactor("5000000", 1e7)).toBe("0.5");
  });

  it("handles large amounts exceeding MAX_SAFE_INTEGER in string form", () => {
    expect(divideByFactor("90071992547409930000", 1_000_000)).toBe("90071992547409.93");
  });

  it("handles amounts with existing non-zero decimals", () => {
    expect(divideByFactor("123.456", 1_000_000)).toBe("0.000123456");
    expect(divideByFactor("1234567.89", 1_000_000)).toBe("1.23456789");
  });
});
