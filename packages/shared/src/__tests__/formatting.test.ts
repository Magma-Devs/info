import { describe, it, expect } from "vitest";
import { ulavaToLava, formatNumber, shortenAddress } from "../utils/formatting.js";

describe("ulavaToLava", () => {
  it("converts whole numbers", () => {
    expect(ulavaToLava(1000000n)).toBe("1");
    expect(ulavaToLava(5000000n)).toBe("5");
  });

  it("converts fractional values", () => {
    expect(ulavaToLava(1500000n)).toBe("1.5");
    expect(ulavaToLava(1234567n)).toBe("1.234567");
  });

  it("converts zero", () => {
    expect(ulavaToLava(0n)).toBe("0");
  });

  it("handles sub-lava amounts", () => {
    expect(ulavaToLava(1n)).toBe("0.000001");
    expect(ulavaToLava(100n)).toBe("0.0001");
  });

  it("handles large values", () => {
    expect(ulavaToLava(1000000000000n)).toBe("1000000");
  });

  it("accepts string input", () => {
    expect(ulavaToLava("1000000")).toBe("1");
  });

  it("trims trailing zeros from fraction", () => {
    expect(ulavaToLava(1100000n)).toBe("1.1");
    expect(ulavaToLava(1010000n)).toBe("1.01");
  });
});

describe("formatNumber", () => {
  it("formats with commas", () => {
    expect(formatNumber(1000)).toBe("1,000");
    expect(formatNumber(1000000)).toBe("1,000,000");
  });

  it("handles zero", () => {
    expect(formatNumber(0)).toBe("0");
  });
});

describe("shortenAddress", () => {
  it("shortens long addresses", () => {
    const addr = "lava@1abcdefghijklmnopqrstuvwxyz0123456789ab";
    const short = shortenAddress(addr, 6);
    expect(short).toContain("...");
    expect(short.length).toBeLessThan(addr.length);
  });

  it("returns short addresses unchanged", () => {
    expect(shortenAddress("short")).toBe("short");
  });
});
