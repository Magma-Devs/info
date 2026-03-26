import type { FastifyInstance } from "fastify";
import { fetchAllProviders, fetchAllSpecs, fetchSubscriptionList } from "../rpc/lava.js";

interface SearchResult {
  id: string;
  name: string;
  type: "provider" | "consumer" | "spec";
  link: string;
  moniker: string;
}

export async function searchRoutes(app: FastifyInstance) {
  // GET /search?q=... — all from chain RPC, cached 10 min
  app.get("/search", { config: { cacheTTL: 600 } }, async (request) => {
    const query = request.query as Record<string, string>;
    const q = query.q?.toLowerCase() ?? "";

    const [providers, specs, subs] = await Promise.all([
      fetchAllProviders(),
      fetchAllSpecs(),
      fetchSubscriptionList(),
    ]);

    const results: SearchResult[] = [];

    for (const p of providers) {
      results.push({
        id: `provider-${p.address}`,
        name: p.address,
        type: "provider",
        link: `/providers/${p.address}`,
        moniker: p.moniker,
      });
    }

    const consumers = [...new Set(subs.map((s) => s.consumer))];
    for (const c of consumers) {
      results.push({
        id: `consumer-${c}`,
        name: c,
        type: "consumer",
        link: `/consumers/${c}`,
        moniker: "",
      });
    }

    for (const s of specs) {
      results.push({
        id: `spec-${s.index}`,
        name: s.index,
        type: "spec",
        link: `/chains/${s.index}`,
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
