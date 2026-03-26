import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

/**
 * CSV format plugin. When ?format=csv is present, transforms JSON array response to CSV.
 * Replaces all /endpointCsv routes.
 */
export const csvPlugin = fp(async (app: FastifyInstance) => {
  app.addHook("onSend", async (request: FastifyRequest, reply: FastifyReply, payload: string) => {
    const query = request.query as Record<string, string>;
    if (query.format !== "csv") return payload;
    if (reply.statusCode >= 400) return payload;

    try {
      const json = JSON.parse(payload);
      const data = Array.isArray(json) ? json : json.data;
      if (!Array.isArray(data) || data.length === 0) {
        reply.header("Content-Type", "text/csv");
        reply.header("Content-Disposition", "attachment; filename=export.csv");
        return "";
      }

      const headers = Object.keys(data[0]);
      const rows = data.map((row: Record<string, unknown>) =>
        headers.map((h) => {
          const val = row[h];
          if (val == null) return "";
          const str = String(val);
          return str.includes(",") || str.includes('"') || str.includes("\n")
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        }).join(","),
      );

      const csv = [headers.join(","), ...rows].join("\n");
      reply.header("Content-Type", "text/csv");
      reply.header("Content-Disposition", "attachment; filename=export.csv");
      return csv;
    } catch {
      return payload;
    }
  });
});
