import { describe, it, expect } from "vitest";
import { formatNumber, formatNumberKMB, formatLava, formatLavaKMB } from "../format.js";

describe("formatNumber", () => {
  it("adds thousand separators", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
  });

  it("handles bigint input", () => {
    expect(formatNumber(1000000n)).toBe("1,000,000");
  });

  it("returns '0' for invalid input", () => {
    expect(formatNumber("not a number")).toBe("0");
  });
});

describe("formatNumberKMB", () => {
  it("formats thousands with K", () => {
    expect(formatNumberKMB(1500)).toBe("1.50K");
  });

  it("formats millions with M", () => {
    expect(formatNumberKMB(2_500_000)).toBe("2.50M");
  });

  it("formats billions with B", () => {
    expect(formatNumberKMB(3_200_000_000)).toBe("3.20B");
  });

  it("leaves small numbers unsuffixed (rounded)", () => {
    expect(formatNumberKMB(42)).toBe("42");
  });
});

describe("formatLava", () => {
  it("converts ulava to LAVA with thousand separators", () => {
    // 1,000,000 ulava = 1 LAVA
    expect(formatLava("1000000")).toBe("1");
    expect(formatLava("1234567000000")).toBe("1,234,567");
  });

  it("accepts bigint input", () => {
    expect(formatLava(5_000_000n)).toBe("5");
  });

  it("strips trailing 'ulava' suffix", () => {
    expect(formatLava("1000000ulava")).toBe("1");
  });

  it("returns '0' for invalid input", () => {
    expect(formatLava("garbage")).toBe("0");
  });
});

describe("formatLavaKMB", () => {
  it("shortens large LAVA amounts", () => {
    // 2,500,000,000,000 ulava = 2,500,000 LAVA = 2.50M LAVA
    expect(formatLavaKMB("2500000000000")).toBe("2.50M");
  });
});
