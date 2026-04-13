import type { FastifyInstance } from "fastify";
import { fetchAllProviders, fetchAllSpecs } from "../rpc/lava.js";

interface SearchResult {
  id: string;
  name: string;
  type: "provider" | "spec";
  link: string;
  moniker: string;
  identity?: string;
}

export async function searchRoutes(app: FastifyInstance) {
  // GET /search?q=... — all from chain RPC, cached 10 min
  app.get("/search", {
    schema: {
      tags: ["Search"],
      summary: "Search providers and specs by address, moniker, or name",
      querystring: {
        type: "object" as const,
        properties: {
          q: { type: "string" as const, description: "Search query (case-insensitive substring match)" },
        },
      },
    },
    config: { cacheTTL: 600 },
  }, async (request) => {
    const query = request.query as Record<string, string>;
    const q = query.q?.toLowerCase() ?? "";

    const [providers, specs] = await Promise.all([
      fetchAllProviders(),
      fetchAllSpecs(),
    ]);

    const results: SearchResult[] = [];

    for (const p of providers) {
      results.push({
        id: `provider-${p.address}`,
        name: p.address,
        type: "provider",
        link: `/provider/${p.address}`,
        moniker: p.moniker,
        identity: p.identity || undefined,
      });
    }

    for (const s of specs) {
      results.push({
        id: `spec-${s.index}`,
        name: s.index,
        type: "spec",
        link: `/chain/${s.index}`,
        moniker: s.name,
      });
    }

    const filtered = q
      ? results.filter((r) =>
          r.name.toLowerCase().includes(q) ||
          r.moniker.toLowerCase().includes(q),
        )
      : results;

    return { data: filtered };
  });
}
