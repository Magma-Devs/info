"use client";

import { useApi } from "./use-api";

interface Spec {
  index: string;
  name: string;
}

/** Fetches chain names from API and returns a lookup function */
export function useChainNames() {
  const { data } = useApi<{ data: Spec[] }>("/lava/specs");

  const map = new Map<string, string>();
  if (data?.data) {
    for (const spec of data.data) {
      map.set(spec.index, spec.name);
    }
  }

  return {
    getName: (chainId: string) => map.get(chainId) ?? chainId,
    specs: data?.data ?? [],
    isLoaded: !!data,
  };
}
