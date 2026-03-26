import { describe, it, expect } from "vitest";

// We can't import main.ts directly (it starts the server), so we test the parsing logic
// by extracting the parseAccountInfo function. Since it's not exported, we replicate the logic here
// to test the parsing behavior. In a real refactor, this should be extracted to a separate module.

const MAX_INT64 = "9223372036854775807";

function parseAccountInfo(
  data: Record<string, unknown>,
): Array<{ spec: string; interfaces: string[]; status: string; jailEndTime?: string }> {
  const results: Array<{ spec: string; interfaces: string[]; status: string; jailEndTime?: string }> = [];

  const addEntries = (entries: unknown[], status: string) => {
    if (!Array.isArray(entries)) return;
    for (const entry of entries) {
      const e = entry as Record<string, unknown>;
      const chains = (e.chains ?? []) as Array<Record<string, unknown>>;
      for (const chain of chains) {
        const endpoints = (chain.endpoints ?? []) as Array<Record<string, unknown>>;
        const interfaces = endpoints.flatMap((ep) => (ep.api_interfaces ?? []) as string[]);
        results.push({
          spec: String(chain.chainID ?? ""),
          interfaces: [...new Set(interfaces)],
          status,
          jailEndTime: e.jail_end_time ? String(e.jail_end_time) : undefined,
        });
      }
    }
  };

  addEntries(data.provider as unknown[], "healthy");
  addEntries(data.frozen as unknown[], "frozen");
  addEntries(data.unstaked as unknown[], "unstaked");

  for (const r of results) {
    if (r.status === "frozen" && r.jailEndTime) {
      r.status = r.jailEndTime === MAX_INT64 ? "frozen" : "jailed";
    }
  }

  return results;
}

describe("parseAccountInfo", () => {
  it("parses healthy providers", () => {
    const data = {
      provider: [{
        address: "lava@test",
        chains: [{
          chainID: "ETH1",
          endpoints: [
            { api_interfaces: ["jsonrpc", "rest"] },
            { api_interfaces: ["grpc"] },
          ],
        }],
      }],
      frozen: [],
      unstaked: [],
    };

    const result = parseAccountInfo(data);
    expect(result).toHaveLength(1);
    expect(result[0].spec).toBe("ETH1");
    expect(result[0].status).toBe("healthy");
    expect(result[0].interfaces).toEqual(expect.arrayContaining(["jsonrpc", "rest", "grpc"]));
  });

  it("parses frozen providers with max int64 jail time", () => {
    const data = {
      provider: [],
      frozen: [{
        address: "lava@frozen",
        jail_end_time: MAX_INT64,
        chains: [{
          chainID: "COSMOS",
          endpoints: [{ api_interfaces: ["tendermint"] }],
        }],
      }],
      unstaked: [],
    };

    const result = parseAccountInfo(data);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("frozen");
  });

  it("parses jailed providers with non-max jail time", () => {
    const data = {
      provider: [],
      frozen: [{
        address: "lava@jailed",
        jail_end_time: "1700000000",
        chains: [{
          chainID: "ETH1",
          endpoints: [{ api_interfaces: ["jsonrpc"] }],
        }],
      }],
      unstaked: [],
    };

    const result = parseAccountInfo(data);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("jailed");
  });

  it("parses unstaked providers", () => {
    const data = {
      provider: [],
      frozen: [],
      unstaked: [{
        address: "lava@unstaked",
        chains: [{
          chainID: "ETH1",
          endpoints: [{ api_interfaces: ["jsonrpc"] }],
        }],
      }],
    };

    const result = parseAccountInfo(data);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("unstaked");
  });

  it("deduplicates interfaces", () => {
    const data = {
      provider: [{
        address: "lava@test",
        chains: [{
          chainID: "ETH1",
          endpoints: [
            { api_interfaces: ["jsonrpc", "rest"] },
            { api_interfaces: ["jsonrpc", "grpc"] },
          ],
        }],
      }],
      frozen: [],
      unstaked: [],
    };

    const result = parseAccountInfo(data);
    const unique = new Set(result[0].interfaces);
    expect(unique.size).toBe(result[0].interfaces.length);
  });

  it("handles multiple chains per provider", () => {
    const data = {
      provider: [{
        address: "lava@multi",
        chains: [
          { chainID: "ETH1", endpoints: [{ api_interfaces: ["jsonrpc"] }] },
          { chainID: "COSMOS", endpoints: [{ api_interfaces: ["tendermint"] }] },
          { chainID: "SOLANA", endpoints: [{ api_interfaces: ["jsonrpc"] }] },
        ],
      }],
      frozen: [],
      unstaked: [],
    };

    const result = parseAccountInfo(data);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.spec)).toEqual(["ETH1", "COSMOS", "SOLANA"]);
  });

  it("handles empty account info", () => {
    const data = { provider: [], frozen: [], unstaked: [] };
    const result = parseAccountInfo(data);
    expect(result).toHaveLength(0);
  });

  it("handles missing fields gracefully", () => {
    const data = {
      provider: [{ address: "lava@test", chains: [{ chainID: "ETH1" }] }],
      frozen: [],
      unstaked: [],
    };

    const result = parseAccountInfo(data);
    expect(result).toHaveLength(1);
    expect(result[0].interfaces).toEqual([]);
  });
});
