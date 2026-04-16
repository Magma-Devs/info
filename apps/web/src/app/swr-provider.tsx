"use client";

import { SWRConfig } from "swr";

/**
 * Global SWR defaults for the whole app.
 *
 * - `dedupingInterval: 10s` — multiple components asking for the same URL
 *   inside a 10-second window share one HTTP request (cuts duplicate fetches
 *   when e.g. both the provider list and a stats card hit `/providers`).
 * - `refreshInterval: 5min` — matches the API's default cache TTL; no point
 *   revalidating more often than that.
 * - `revalidateOnFocus: false` — on tab refocus, keep the cached data; the
 *   refresh interval already covers staleness.
 * - `keepPreviousData: true` — when the URL changes (e.g. network toggle),
 *   render stale data until the new one arrives instead of flashing empty.
 *
 * Per-call overrides are still honored — `useApi` and any raw `useSWR` can
 * set their own options if they need tighter/looser behaviour.
 */
export function SwrProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        dedupingInterval: 10_000,
        refreshInterval: 5 * 60 * 1000,
        revalidateOnFocus: false,
        keepPreviousData: true,
      }}
    >
      {children}
    </SWRConfig>
  );
}
