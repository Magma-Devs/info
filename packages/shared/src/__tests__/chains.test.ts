import { describe, it, expect } from "vitest";
import { normalizeBlock, resolveGeolocation } from "../constants/chains.js";

describe("normalizeBlock", () => {
  it("returns block unchanged for standard chains", () => {
    expect(normalizeBlock("ETHEREUM", 12345)).toBe(12345);
    expect(normalizeBlock("COSMOS", 0)).toBe(0);
  });

  it("normalizes HYPERLIQUID blocks above threshold to 1", () => {
    expect(normalizeBlock("HYPERLIQUID", 9223372036854776000)).toBe(1);
  });

  it("normalizes HYPERLIQUID zero blocks to 1", () => {
    expect(normalizeBlock("HYPERLIQUID", 0)).toBe(1);
  });

  it("normalizes HEDERA blocks above threshold to 1", () => {
    expect(normalizeBlock("HEDERA", 2000000000000)).toBe(1);
  });

  it("normalizes HEDERAT (testnet) too", () => {
    expect(normalizeBlock("HEDERAT", 0)).toBe(1);
  });

  it("leaves normal HYPERLIQUID blocks unchanged", () => {
    expect(normalizeBlock("HYPERLIQUID", 500)).toBe(500);
  });

  it("handles HYPERLIQUIDT variant", () => {
    expect(normalizeBlock("HYPERLIQUIDT", 9223372036854776000)).toBe(1);
  });
});

describe("resolveGeolocation", () => {
  it("passes through region label", () => {
    expect(resolveGeolocation("US")).toBe("US");
    expect(resolveGeolocation("EU")).toBe("EU");
    expect(resolveGeolocation("ASIA")).toBe("ASIA");
  });

  it("returns Local for undefined", () => {
    expect(resolveGeolocation(undefined)).toBe("Local");
  });

  it("returns Local for empty string", () => {
    expect(resolveGeolocation("")).toBe("Local");
  });
});
