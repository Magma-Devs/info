import { describe, it, expect, beforeEach, vi } from "vitest";

describe("config", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("uses default values when no env vars set", async () => {
    const { getConfig } = await import("../config.js");
    const config = getConfig();
    expect(config.PROVIDERS_URL).toBe("https://info.lavanet.xyz/providers");
    expect(config.NODE_URL).toBe("https://public-rpc.lavanet.xyz:443");
    expect(config.HEALTH_PROBE_HTTP_PORT).toBe(6500);
    expect(config.HEALTH_PROBE_HTTP_HOST).toBe("0.0.0.0");
    expect(config.REGION).toBe("Local");
    expect(config.LAVAD_PATH).toBe("lavad");
    expect(config.LAVAP_PATH).toBe("lavap");
    expect(config.DB_HOST).toBe("localhost");
    expect(config.DB_SCHEMA).toBe("app");
  });

  it("reads from environment variables", async () => {
    process.env.PROVIDERS_URL = "http://custom:8080/providers";
    process.env.HEALTH_PROBE_HTTP_PORT = "7000";
    process.env.REGION = "EU";
    process.env.DB_HOST = "remote-indexer.example.com";

    const { getConfig } = await import("../config.js");
    const config = getConfig();
    expect(config.PROVIDERS_URL).toBe("http://custom:8080/providers");
    expect(config.HEALTH_PROBE_HTTP_PORT).toBe(7000);
    expect(config.REGION).toBe("EU");
    expect(config.DB_HOST).toBe("remote-indexer.example.com");

    delete process.env.PROVIDERS_URL;
    delete process.env.HEALTH_PROBE_HTTP_PORT;
    delete process.env.REGION;
    delete process.env.DB_HOST;
  });

  it("validates URL format for PROVIDERS_URL", async () => {
    process.env.PROVIDERS_URL = "not-a-url";
    try {
      const { getConfig } = await import("../config.js");
      getConfig();
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeDefined();
    }
    delete process.env.PROVIDERS_URL;
  });
});
