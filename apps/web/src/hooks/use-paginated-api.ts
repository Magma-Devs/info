"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback } from "react";
import { useApi } from "./use-api";

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

/**
 * Paginated API hook. Pagination state lives in URL search params.
 * Replaces useJsinfobePaginationFetch + PaginationState class (176 lines).
 */
export function usePaginatedApi<T>(basePath: string) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = parseInt(searchParams.get("limit") ?? "20", 10);
  const sort = searchParams.get("sort") ?? undefined;
  const orderParam = searchParams.get("order");
  const order = orderParam === "asc" ? "asc" as const : "desc" as const;

  const queryString = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    ...(sort ? { sort } : {}),
    order,
  }).toString();

  const { data, error, isLoading, mutate } = useApi<PaginatedResponse<T>>(
    `${basePath}?${queryString}`,
  );

  const setPage = useCallback(
    (newPage: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("page", String(newPage));
      router.push(`${pathname}?${params.toString()}`);
    },
    [searchParams, router, pathname],
  );

  const setSort = useCallback(
    (newSort: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const currentSort = params.get("sort");
      if (currentSort === newSort) {
        params.set("order", params.get("order") === "asc" ? "desc" : "asc");
      } else {
        params.set("sort", newSort);
        params.set("order", "asc");
      }
      params.set("page", "1");
      router.push(`${pathname}?${params.toString()}`);
    },
    [searchParams, router, pathname],
  );

  return {
    data: data?.data ?? [],
    pagination: data?.pagination ?? { total: 0, page, limit, pages: 0 },
    error,
    isLoading,
    mutate,
    setPage,
    setSort,
    sort,
    order,
  };
}
