import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import { errorHandlerPlugin } from "../plugins/error-handler.js";
import { usageRoutes } from "../routes/usage.js";

// We mock global fetch to avoid hitting public status pages from CI. The
// route handler delegates to services/incidents.ts, which fans out across
// Cloudflare/GCP/Vercel JSON APIs and 12 blockchain status pages — testing
// that surface end-to-end against real upstreams would be flaky and slow.

const realFetch = globalThis.fetch;

function mockFetch(handler: (url: string) => Promise<Response> | Response) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return handler(url);
  }) as typeof fetch;
}

function jsonRes(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(usageRoutes, { prefix: "/usage" });
  return app;
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("GET /usage/cloud-incidents", () => {
  it("aggregates Cloudflare/GCP/Vercel + curated baselines", async () => {
    mockFetch(async (url) => {
      if (url.includes("cloudflarestatus.com")) {
        return jsonRes({
          incidents: [
            {
              name: "CF outage",
              created_at: "2026-04-01T10:00:00Z",
              impact: "major",
              status: "resolved",
              incident_updates: [{ body: "fixed" }],
            },
          ],
        });
      }
      if (url.includes("status.cloud.google.com")) {
        return jsonRes([
          {
            external_desc: "GCP issue",
            begin: "2026-03-01T08:00:00Z",
            end: "2026-03-01T09:00:00Z",
            severity: "Minor",
            most_recent_update: { text: "ok" },
          },
        ]);
      }
      if (url.includes("vercel-status.com")) {
        return jsonRes({
          incidents: [
            {
              name: "Build errors",
              created_at: "2026-04-10T12:00:00Z",
              impact: "minor",
              status: "resolved",
            },
          ],
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/usage/cloud-incidents" });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.generated_at).toBeDefined();
    expect(typeof body.total_incidents).toBe("number");

    // Per-provider counts include the live mocks AND the curated baselines.
    expect(body.providers.cloudflare).toBe(1);
    expect(body.providers.google_cloud).toBe(1);
    expect(body.providers.vercel).toBe(1);
    // Baselines are committed to incident-baselines.ts, so these are
    // deterministic regardless of network state.
    expect(body.providers.aws).toBeGreaterThan(0);
    expect(body.providers.azure).toBeGreaterThan(0);
    expect(body.providers.digitalocean).toBeGreaterThan(0);
    expect(body.providers.oracle_cloud).toBeGreaterThan(0);

    // Incidents are sorted newest first.
    const ts = body.incidents.map((i: { timestamp: string }) => new Date(i.timestamp).getTime());
    for (let i = 1; i < ts.length; i++) {
      expect(ts[i - 1]).toBeGreaterThanOrEqual(ts[i]);
    }

    // Spot-check schema on a Cloudflare row.
    const cf = body.incidents.find((i: { provider: string }) => i.provider === "Cloudflare");
    expect(cf).toMatchObject({
      provider: "Cloudflare",
      name: "CF outage",
      date: "2026-04-01",
      timestamp: "2026-04-01T10:00:00Z",
      impact: "major",
      status: "resolved",
      description: "fixed",
    });
  });

  it("falls back gracefully when an upstream is down", async () => {
    // Cloudflare 500s, GCP throws, Vercel returns empty — the handler must
    // still return baselines and a well-formed body.
    mockFetch(async (url) => {
      if (url.includes("cloudflarestatus.com")) {
        return new Response("oops", { status: 500 });
      }
      if (url.includes("status.cloud.google.com")) {
        throw new Error("network down");
      }
      if (url.includes("vercel-status.com")) {
        return jsonRes({ incidents: [] });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/usage/cloud-incidents" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.providers.cloudflare).toBe(0);
    expect(body.providers.google_cloud).toBe(0);
    expect(body.providers.vercel).toBe(0);
    // Baselines still present.
    expect(body.providers.aws).toBeGreaterThan(0);
  });
});

describe("GET /usage/blockchain-incidents", () => {
  it("returns the documented shape even when all upstreams fail", async () => {
    // Every blockchain status page either 500s or returns empty pages.
    // The route must still respond 200 with a well-formed (empty) payload —
    // the alternative is a flaky page that breaks if any one of 12 status
    // sources is down.
    mockFetch(async () => new Response("", { status: 500 }));

    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/usage/blockchain-incidents" });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.summary).toMatchObject({
      by_impact: expect.any(Object),
      total_incidents: expect.any(Number),
    });
    expect(Array.isArray(body.incidents)).toBe(true);
    expect(body.metadata.year).toBe(2025);
    expect(Array.isArray(body.metadata.providers)).toBe(true);
  }, 30_000);
});
