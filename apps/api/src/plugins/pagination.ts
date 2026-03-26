import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest } from "fastify";

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
 * Replaces the old `pagination=sortKey,direction,page,count` format with standard REST params.
 */
export function parsePagination(query: PaginationQuery): ParsedPagination {
  const page = Math.max(1, Math.min(4000, parseInt(query.page ?? "1", 10) || 1));
  const limit = Math.max(1, Math.min(100, parseInt(query.limit ?? "20", 10) || 20));
  const offset = (page - 1) * limit;
  const sort = query.sort ?? null;
  const order = query.order === "desc" ? "desc" : "asc";
  return { page, limit, offset, sort, order };
}

declare module "fastify" {
  interface FastifyRequest {
    pagination: ParsedPagination;
  }
}

/**
 * Pagination plugin. Parses ?page, ?limit, ?sort, ?order from query string.
 * Sets X-Total-Count header when reply.totalCount is set.
 * Replaces all /item-count/* routes.
 */
export const paginationPlugin = fp(async (app: FastifyInstance) => {
  app.decorateRequest("pagination", {
    getter() {
      return parsePagination((this as FastifyRequest).query as PaginationQuery);
    },
  });
});
