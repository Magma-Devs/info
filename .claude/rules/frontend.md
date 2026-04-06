---
paths:
  - "apps/web/**/*.tsx"
  - "apps/web/**/*.ts"
---

# Frontend Conventions

## Data fetching
- Use `useApi<T>(path)` hook for single requests — returns `{ data, isLoading, error }`
- Use `usePaginatedApi<T>(path)` for paginated endpoints — returns pagination controls
- API base URL comes from `NEXT_PUBLIC_API_URL` env var
- Network toggle (Mainnet/Testnet) switches the API URL via localStorage

## Components
- `ChainLink` — chain ID with icon and link, `showName` prop for full name display
- `ProviderLink` — provider address with avatar (Keybase identity or letter placeholder)
- `LavaAmount` — formats ulava to LAVA with locale formatting
- `StatCard` — metric card with label, value, optional icon
- `SortableTable` — reusable TanStack Table wrapper with sorting and pagination
- `Chart` — Recharts wrapper for time-series data

## Chain icons
- Served from `/chains/{specId}.svg` (local public directory)
- Aliases in `lib/chain-icons.ts` for specIds that don't match filenames
- Fallback: letter placeholder on `onError`
- To add a new chain icon: drop an SVG in `public/chains/`, add alias if specId differs from filename

## Base specs
- `COSMOSSDK`, `COSMOSSDK50`, `COSMOSWASM`, `ETHERMINT`, `TENDERMINT`, `IBC` are base specs
- Exclude them from chain lists and UI — they're not real chains
