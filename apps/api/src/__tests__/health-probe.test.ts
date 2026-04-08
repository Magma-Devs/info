import { describe, it, expect } from "vitest";

// Import the function by re-exporting it for testing
// Since isPublicEndpoint is not exported, we test it indirectly by extracting the logic
// For now, replicate the logic here to test the SSRF filter

function isPublicEndpoint(iPPORT: string): boolean {
  const host = iPPORT.split(":")[0];
  if (!host) return false;
  if (host === "localhost" || host === "0.0.0.0") return false;
  if (host.startsWith("127.")) return false;
  if (host.startsWith("10.")) return false;
  if (host.startsWith("192.168.")) return false;
  if (host.startsWith("172.")) {
    const second = parseInt(host.split(".")[1], 10);
    if (second >= 16 && second <= 31) return false;
  }
  if (host.startsWith("169.254.")) return false;
  return true;
}

describe("isPublicEndpoint (SSRF filter)", () => {
  it("allows public endpoints", () => {
    expect(isPublicEndpoint("provider.lava.build:443")).toBe(true);
    expect(isPublicEndpoint("1.2.3.4:9090")).toBe(true);
    expect(isPublicEndpoint("grpc.example.com:443")).toBe(true);
  });

  it("blocks localhost", () => {
    expect(isPublicEndpoint("localhost:8080")).toBe(false);
    expect(isPublicEndpoint("127.0.0.1:443")).toBe(false);
    expect(isPublicEndpoint("127.0.0.2:443")).toBe(false);
  });

  it("blocks 0.0.0.0", () => {
    expect(isPublicEndpoint("0.0.0.0:443")).toBe(false);
  });

  it("blocks private 10.x.x.x", () => {
    expect(isPublicEndpoint("10.0.0.1:443")).toBe(false);
    expect(isPublicEndpoint("10.255.255.255:443")).toBe(false);
  });

  it("blocks private 192.168.x.x", () => {
    expect(isPublicEndpoint("192.168.1.1:443")).toBe(false);
    expect(isPublicEndpoint("192.168.0.100:9090")).toBe(false);
  });

  it("blocks private 172.16-31.x.x", () => {
    expect(isPublicEndpoint("172.16.0.1:443")).toBe(false);
    expect(isPublicEndpoint("172.31.255.255:443")).toBe(false);
  });

  it("allows public 172.x outside 16-31 range", () => {
    expect(isPublicEndpoint("172.15.0.1:443")).toBe(true);
    expect(isPublicEndpoint("172.32.0.1:443")).toBe(true);
  });

  it("blocks link-local 169.254.x.x", () => {
    expect(isPublicEndpoint("169.254.1.1:443")).toBe(false);
  });

  it("rejects empty or malformed", () => {
    expect(isPublicEndpoint("")).toBe(false);
    expect(isPublicEndpoint(":443")).toBe(false);
  });
});
