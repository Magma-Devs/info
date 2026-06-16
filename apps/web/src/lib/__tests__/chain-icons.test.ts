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

  it("resolves newly-added chains to their own icon file", () => {
    expect(getChainIcon("CELESTIA")).toBe("/chains/celestia.svg");
    expect(getChainIcon("OSMOSIS")).toBe("/chains/osmosis.svg");
    expect(getChainIcon("INJECTIVE")).toBe("/chains/injective.svg");
    expect(getChainIcon("ZKSYNC")).toBe("/chains/zksync.svg");
    expect(getChainIcon("XRP")).toBe("/chains/xrp.svg");
    expect(getChainIcon("MORALIS")).toBe("/chains/moralis.svg");
    expect(getChainIcon("SQDSUBGRAPH")).toBe("/chains/sqdsubgraph.svg");
  });

  it("aliases testnet / variant specIds onto their mainnet icon", () => {
    expect(getChainIcon("CELESTIATA")).toBe("/chains/celestia.svg");
    expect(getChainIcon("CELESTIATM")).toBe("/chains/celestia.svg");
    expect(getChainIcon("SUIT")).toBe("/chains/sui.svg");
    expect(getChainIcon("LAV1")).toBe("/chains/lava.svg");
    expect(getChainIcon("MONADT")).toBe("/chains/monad.svg");
    expect(getChainIcon("CARDANOT")).toBe("/chains/cardano.svg");
    expect(getChainIcon("BERAT2")).toBe("/chains/bera.svg");
    expect(getChainIcon("ZKSYNCSP")).toBe("/chains/zksync.svg");
  });

  it("is case-insensitive on input", () => {
    expect(getChainIcon("FVMT")).toBe("/chains/filecoin.svg");
    expect(getChainIcon("fvmt")).toBe("/chains/filecoin.svg");
  });
});
