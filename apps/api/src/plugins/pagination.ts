import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest } from "fastify";

/** Default max rows per page. Override per-route via config.maxLimit. */
const DEFAULT_MAX_LIMIT = 100;

export interface PaginationQuery {
  page?: string;
  limit?: string;
  sort?: string;
  order?: string;
}

export interface ParsedPagination {
  page: number;
  limit: number;
  offset: number;
  sort: string | null;
  order: "asc" | "desc";
}

/**
 * Parse pagination from query params.
 * maxLimit caps the upper bound (default 100, configurable per-route via config.maxLimit).
 */
export function parsePagination(query: PaginationQuery, maxLimit = DEFAULT_MAX_LIMIT): ParsedPagination {
  const page = Math.max(1, Math.min(4000, parseInt(query.page ?? "1", 10) || 1));
  const limit = Math.max(1, Math.min(maxLimit, parseInt(query.limit ?? "20", 10) || 20));
  const offset = (page - 1) * limit;
  const sort = query.sort ?? null;
  const order = query.order === "desc" ? "desc" : "asc";
  return { page, limit, offset, sort, order };
}

declare module "fastify" {
  interface FastifyRequest {
    pagination: ParsedPagination;
  }
  interface FastifyContextConfig {
    maxLimit?: number;
  }
}

/**
 * Pagination plugin. Parses ?page, ?limit, ?sort, ?order from query string.
 * Per-route upper bound via config.maxLimit (default 100).
 */
export const paginationPlugin = fp(async (app: FastifyInstance) => {
  app.decorateRequest("pagination", {
    getter() {
      const req = this as FastifyRequest;
      const maxLimit = req.routeOptions.config?.maxLimit ?? DEFAULT_MAX_LIMIT;
      return parsePagination(req.query as PaginationQuery, maxLimit);
    },
  });
});
