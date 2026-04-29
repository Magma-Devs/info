import type { FastifyInstance } from "fastify";
import { CACHE_TTL, config } from "../config.js";
import { getChainIconUrl } from "@info/shared/utils";
import { fetchAllSpecs } from "../rpc/lava.js";

export async function lavaRoutes(app: FastifyInstance) {
  // GET /lava/specs — all chain specs with icon URLs (consumed by frontend useChainNames hook)
  app.get("/specs", {
    schema: { tags: ["Lava"], summary: "All chain specs with display name and icon URL" },
    config: { cacheTTL: CACHE_TTL.LIST },
  }, async () => {
    const specs = await fetchAllSpecs();
    const iconBase = config.icons.baseUrl;
    return {
      data: specs.map((s) => ({
        index: s.index,
        name: s.name,
        icon: getChainIconUrl(s.index, iconBase),
      })),
    };
  });
}
