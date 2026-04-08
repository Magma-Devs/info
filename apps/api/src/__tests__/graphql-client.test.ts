import { describe, it, expect, vi, beforeEach } from "vitest";

const { gqlSafe } = await import("../graphql/client.js");

describe("gqlSafe", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns fallback when fetch fails (indexer down)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const fallback = { test: { nodes: [] } };
    const result = await gqlSafe("{ test { nodes { id } } }", undefined, fallback);
    expect(result).toBe(fallback);
  });

  it("returns fallback when GraphQL returns errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ errors: [{ message: "table not found" }] }),
    }));

    const result = await gqlSafe("{ test { id } }", undefined, null);
    expect(result).toBeNull();
  });

  it("returns fallback on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
    }));

    const result = await gqlSafe("{ test { id } }", undefined, { empty: true });
    expect(result).toEqual({ empty: true });
  });

  it("returns data on success", async () => {
    const data = { test: { nodes: [{ id: "1" }] } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data }),
    }));

    const result = await gqlSafe("{ test { nodes { id } } }", undefined, null);
    expect(result).toEqual(data);
  });
});
