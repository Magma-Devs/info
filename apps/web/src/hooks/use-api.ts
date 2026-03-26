"use client";

import useSWR from "swr";
import { api } from "@/lib/api-client";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

/**
 * Simple SWR wrapper for API calls.
 * Replaces useJsinfobeFetch — no custom Map cache, no memory leaks.
 */
export function useApi<T>(url: string | null) {
  const { data, error, isLoading, mutate } = useSWR<T>(url, fetcher, {
    refreshInterval: 5 * 60 * 1000, // 5 minutes
    revalidateOnFocus: true,
    keepPreviousData: true,
  });

  return { data, error, isLoading, mutate };
}
