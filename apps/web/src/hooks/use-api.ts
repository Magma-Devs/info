"use client";

import useSWR from "swr";
import { api } from "@/lib/api-client";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

/**
 * Simple SWR wrapper for API calls.
 *
 * Defaults (dedupingInterval, refreshInterval, revalidateOnFocus,
 * keepPreviousData) come from the root <SwrProvider> — this hook just adds
 * the shared axios-based fetcher. Per-call options still win if you pass
 * them here in the future.
 */
export function useApi<T>(url: string | null) {
  const { data, error, isLoading, mutate } = useSWR<T>(url, fetcher);
  return { data, error, isLoading, mutate };
}
