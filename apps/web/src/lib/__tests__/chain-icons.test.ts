import { describe, it, expect } from "vitest";
import { getChainIcon } from "../chain-icons.js";

describe("getChainIcon", () => {
  it("maps known alias specIds to their canonical icon filename", () => {
    expect(getChainIcon("ETH1")).toBe("/chains/ethereum.svg");
    expect(getChainIcon("eth1")).toBe("/chains/ethereum.svg");
    expect(getChainIcon("BSC")).toBe("/chains/bsc.svg");
    expect(getChainIcon("COSMOSHUB")).toBe("/chains/cosmos-hub.svg");
  });

  it("falls back to the lowercased specId for unknown chains", () => {
    expect(getChainIcon("NEWCHAIN")).toBe("/chains/newchain.svg");
  });

  it("is case-insensitive on input", () => {
    expect(getChainIcon("FVMT")).toBe("/chains/filecoin.svg");
    expect(getChainIcon("fvmt")).toBe("/chains/filecoin.svg");
  });
});
