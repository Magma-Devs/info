# Info — Lava Network Explorer

Blockchain explorer for [Lava Network](https://lavanet.xyz). Tracks providers, chains (specs), relay payments, staking, and supply across Mainnet and Testnet.

## Quick Start

```bash
# Local dev (requires Node 22 + pnpm 10)
pnpm install && pnpm dev

# Docker dev (zero prerequisites, hot reload on code changes)
docker compose -f docker-compose.dev.yml up --build
# API → localhost:8080  |  Web → localhost:3001  |  Indexer GraphQL → localhost:3000
```

```bash
pnpm typecheck    # type check all packages
pnpm test         # vitest
```

## Architecture

```
┌─────────────────┐              ┌───────────────────────────────────────┐
│   apps/web      │   REST       │           apps/api                    │
│   Next.js 15    │─────────────▶│           Fastify 5 (:8080)           │
│   (:3001)       │              │                                       │
│                 │              │   ┌──────────┐   ┌──────────────────┐ │
│  SWR cache      │              │   │  Redis    │   │  Chain RPC/REST  │ │
│  axios client   │              │   │  (cache)  │   │  (live state)    │ │
│  TanStack Table │              │   └──────────┘   └──────────────────┘ │
│  Recharts       │              │         │                  │          │
└─────────────────┘              │   ┌─────┴──────────────────┴────────┐ │
                                 │   │  Route handlers                 │ │
                                 │   │  apps/api/src/routes/*.ts       │ │
                                 │   └─────────────────────────────────┘ │
                                 └──────────────┬────────────────────────┘
                                                │ GraphQL (PostGraphile)
                                 ┌──────────────▼────────────────────────┐
                                 │  SubQuery Indexer (:3000)             │
                                 │  PostgreSQL + PostGraphile            │
                                 │  lava-indexer-test repo               │
                                 │                                       │
                                 │  Tables (6):                          │
                                 │    relay_payments (18.8M rows)        │
                                 │    blockchain_events                  │
                                 │    provider_reports                   │
                                 │    provider_block_reports             │
                                 │    conflict_votes                     │
                                 │    conflict_responses                 │
                                 │                                       │
                                 │  Materialized Views (auto-created):   │
                                 │    mv_relay_daily                     │
                                 │      → (date, chain_id, provider)     │
                                 │      → cu, relays, qos weighted sums  │
                                 │    mv_consumer_relay_daily            │
                                 │      → (date, chain_id, consumer)     │
                                 │      → cu, relays, qos weighted sums  │
                                 │  Refreshed every 5 min via pg_cron    │
                                 └───────────────────────────────────────┘
```

### Data Source Rules

Every API route uses exactly one data source per query. Never mix them in a single call.

| Source | What it provides | Access pattern |
|--------|-----------------|----------------|
| **Indexer GraphQL** (`INDEXER_GRAPHQL_URL`, default `http://localhost:3000`) | Historical relay data, events, reports, conflicts | `gql<T>(query, vars)` from `graphql/client.ts` |
| **Chain RPC REST** (`LAVA_REST_URL`, default `https://lava.rest.lava.build`) | Live state: specs, providers per spec, stakes, supply, subscriptions, staking pool | `fetchRest<T>(path)` from `rpc/lava.ts` |
| **Chain RPC Tendermint** (`LAVA_RPC_URL`, default `https://lava.tendermintrpc.lava.build:443`) | Latest block height and time | Direct `fetch()` to `/status` |
| **Redis — cache** (`REDIS_URL`) | Response-level cache (not a data source) | Automatic via `cacheTTL` in route config |
| **Redis — health store** (`REDIS_URL`) | Provider health probe results (gRPC Probe, 10min TTL) | `readHealthMapForProvider()` / `readHealthByProviderForSpec()` from `services/health-store.ts` |
| **Keybase API** | Provider avatars from identity field | `fetchProviderAvatar()` in `rpc/lava.ts` |

### Caching

Cache is set per-route via config, handled automatically by onRequest/onSend hooks:
```ts
app.get("/path", { config: { cacheTTL: 300 } }, handler)
```
No cache calls inside handlers. TTL guidelines:
- Health/realtime: 10–30s
- Lists/aggregates: 60–300s
- Supply/TVL: 300s
- APR: 1800s (expensive — iterates all providers/validators)
- Avatars: 86400s (24h)

### Materialized Views (Critical)

**Never query raw `relayPayments` (18.8M rows) — it will timeout.** Always use:

- `mvRelayDailies` — aggregated by `(date, chain_id, provider)`. Has: `cu`, `relays`, `qosSyncW`, `qosAvailW`, `qosLatencyW`, `qosWeight`, `exQosSyncW`, `exQosAvailW`, `exQosLatencyW`, `exQosWeight`
- `mvConsumerRelayDailies` — aggregated by `(date, chain_id, consumer)`. Same fields minus excellence QoS.

Date filters must use `Date` type with `YYYY-MM-DD` format (not `Datetime`, not ISO):
```graphql
query($since: Date!) {
  mvRelayDailies(filter: { date: { greaterThanOrEqualTo: $since } }) { ... }
}
```

QoS is computed from weighted sums, not simple averages:
```ts
const qosSync = qosWeight > 0 ? qosSyncW / qosWeight : null;
```

MVs are auto-created by PostgreSQL event triggers in `lava-indexer-test/docker/init.sql` and refreshed every 5 minutes via pg_cron.

## Monorepo Layout

```
apps/
  api/                 Fastify 5 REST API (port 8080)
    src/
      routes/          One file per resource (index, providers, specs, events, etc.)
      rpc/lava.ts      All chain RPC/REST calls + business logic (supply, TVL, APR, display names)
      graphql/client.ts  GraphQL client wrapper — gql<T>(query, vars)
      plugins/cache.ts   Redis cache plugin (onRequest/onSend hooks)
      plugins/redis.ts   Shared Redis client decorator (app.redis)
      plugins/health-probe.ts  Background gRPC health probe (ENABLE_HEALTH_PROBE=true)
      services/grpc-probe.ts   Native gRPC Relayer.Probe() client
      services/health-store.ts Redis read/write for health data
      proto/relay.proto  Minimal proto for Lava Relayer.Probe RPC
  web/                 Next.js 15 App Router frontend
    src/
      app/             Pages mirror API structure (chains/, providers/, provider/[lavaid]/, etc.)
      components/
        ui/            shadcn primitives (badge, button, card, table, tabs)
        data/          Domain components (ChainLink, ProviderLink, LavaAmount, StatCard, Chart, SortableTable)
        layout/        Shell (Header, Footer, MobileNav, SearchBar)
      hooks/           useApi (SWR), usePaginatedApi, useChainNames
      lib/             Utilities (api-client, chain-icons, format, cn, csv)
    public/chains/     32 SVG chain icons, convention-based: /chains/{specId}.svg
packages/
  shared/              Shared constants (BASE_SPECS, geolocation, block normalization)
```

## API Endpoints — Complete Reference

### Index (`/index`)

| Endpoint | Cache | Source | Description |
|----------|-------|--------|-------------|
| `GET /index/stats` | 60s | Indexer MV + Chain RPC | Alltime totals (CU, relays), 30-day totals, total stake (sum across all providers), active provider count, latest block height/time |
| `GET /index/top-chains` | 300s | Indexer MV | Top 20 chains by alltime CU. Groups `mvRelayDailies` by `CHAIN_ID` |
| `GET /index/charts?from=&to=` | 300s | Indexer MV | Daily time-series per chain. Collapses provider dimension by re-aggregating MV by (date, chainId). Default 90 days. Returns: date, chainId, cu, relays, qosSync, qosAvailability, qosLatency |

### Providers (`/providers`)

| Endpoint | Cache | Source | Description |
|----------|-------|--------|-------------|
| `GET /providers?page=&limit=` | 300s | Chain RPC + Indexer MV | Paginated provider list. Fetches all providers from chain, enriches with 30d relay data from MV (grouped by PROVIDER). Sorted by totalStake desc. Returns: provider, moniker, identity, activeServices, totalStake, totalDelegation, commission, cuSum30d, relaySum30d |
| `GET /providers/:addr` | 300s | Chain RPC | Provider detail. Fetches **every spec** and checks if provider is staked. Returns stakes array with: specId, stake, delegation, moniker, delegateCommission, geolocation, addons, extensions |
| `GET /providers/:addr/stakes` | 300s | Chain RPC | Same as above but returns only the stakes array (no moniker) |
| `GET /providers/:addr/health?page=&limit=` | 30s | Redis | Paginated health records from gRPC probe (stored in Redis with 10min TTL) |
| `GET /providers/:addr/events?page=&limit=` | — | Indexer GQL | Paginated blockchain events filtered by provider |
| `GET /providers/:addr/rewards?page=&limit=` | — | Indexer GQL | Paginated relay payments (raw `relayPayments` table, filtered by provider). Returns: provider, consumer, chainId, cu, rewardedCu, relayNumber, all QoS fields, timestamp |
| `GET /providers/:addr/reports?page=&limit=` | — | Indexer GQL | Paginated provider reports: cu, errors, disconnections, epoch |
| `GET /providers/:addr/charts?from=&to=&chain=` | 300s | Indexer MV | **Two modes**: (1) No params → alltime summary grouped by chain (cu, relays per chainId). (2) With date params → daily time-series with QoS + excellence QoS. Can filter by chain |
| `GET /providers/:addr/avatar?identity=` | 86400s | Keybase API | Avatar URL from Keybase identity. Hint param skips provider metadata lookup. Returns `{ url: string \| null }` |
| `GET /providers/:addr/delegator-rewards` | 300s | Chain RPC | Delegator rewards from dualstaking module |
| `GET /providers/:addr/block-reports?page=&limit=` | — | Indexer GQL | Paginated block height reports |

### Specs/Chains (`/specs`)

| Endpoint | Cache | Source | Description |
|----------|-------|--------|-------------|
| `GET /specs` | 300s | Chain RPC + Indexer MV | All specs (excluding base specs). Returns: specId, name (display name with proper casing), providerCount, relays30d, cu30d. Provider counts fetched per-spec from chain. 30d relay data from MV grouped by CHAIN_ID |
| `GET /specs/:specId/stakes` | 300s | Chain RPC | Providers staked on this spec: provider, moniker, stake, delegation, delegateCommission, geolocation |
| `GET /specs/:specId/health` | 30s | Redis | Health status distribution (grouped by STATUS, from gRPC probe) |
| `GET /specs/:specId/charts` | 300s | Indexer MV | Alltime CU/relays for this chain (grouped by CHAIN_ID) |
| `GET /specs/:specId/tracked-info` | 300s | Chain RPC | IPRPC spec rewards (provider, iprpcCu) |

### Events (`/events`)

| Endpoint | Cache | Source | Description |
|----------|-------|--------|-------------|
| `GET /events?type=events&page=&limit=` | — | Indexer GQL | Paginated blockchain events (default). Ordered by BLOCK_HEIGHT_DESC |
| `GET /events?type=rewards&page=&limit=` | — | Indexer GQL | Paginated relay payments. Ordered by TIMESTAMP_DESC |
| `GET /events?type=reports&page=&limit=` | — | Indexer GQL | Paginated provider reports. Ordered by BLOCK_HEIGHT_DESC |

### Supply (`/supply`)

| Endpoint | Cache | Source | Description |
|----------|-------|--------|-------------|
| `GET /supply/total` | 300s | Chain RPC | Total supply in LAVA (plain text). `fetchTotalSupply() / 1_000_000` |
| `GET /supply/circulating` | 300s | Chain RPC | Circulating supply in LAVA (plain text). Formula: `total - continuousVesting - periodicVesting - rewardPools`. Paginates through all ~53K accounts to calculate locked vesting amounts. 5 reward pools subtracted: validators_rewards_distribution_pool, validators_rewards_allocation_pool, providers_rewards_distribution_pool, providers_rewards_allocation_pool, iprpc_pool |

### Other (root-level)

| Endpoint | Cache | Source | Description |
|----------|-------|--------|-------------|
| `GET /health` | — | — | Returns `{ health: "ok" }` |
| `GET /health/status` | 10s | Chain RPC | Block height + staleness check (>5 min = degraded). Returns 503 on RPC error |
| `GET /search?q=` | 600s | Chain RPC | Searches providers (by address/moniker) and specs (by specId/name). Case-insensitive substring match. Returns all if no query |
| `GET /tvl` | 300s | Chain RPC + CoinGecko | TVL (USD) = bonded tokens + reward pools + subscriptions + DEX liquidity. All components converted to USD via CoinGecko LAVA price |
| `GET /apr` | 1800s | Chain RPC + CoinGecko | Per-entity APR percentiles matching jsinfo. Queries `estimated_{provider,validator}_rewards` for all providers/validators with 10k LAVA benchmark, converts multi-denom rewards to USD, compounds monthly, takes 80th percentile, caps at 30%. Returns `{ restaking_apr_percentile, staking_apr_percentile }`. Uses 7-day weighted Redis history when available |
| `GET /all_providers_apr` | 1800s | Chain RPC + CoinGecko + Indexer MV | Per-provider APR data matching jsinfo. Returns array of providers with: APR, commission, 30d CU/relays, 10k LAVA reward breakdown, per-spec rewards (rewards_last_month), specs, avatar |
| `GET /validators` | 300s | Chain RPC | Staking pool info (bonded/not_bonded tokens). Validator list is placeholder `[]` |
| `GET /lava/stakers` | 300s | Chain RPC | Just `{ bonded_tokens }` from staking pool |
| `GET /lava/specs` | 300s | Chain RPC | All chain specs (raw, used by frontend `useChainNames` hook) |
| `GET /lava/iprpc` | 300s | — | Placeholder, returns `{ data: [] }` |

## Pagination Convention

All paginated endpoints accept: `?page=1&limit=20&sort=field&order=asc|desc`
Response shape: `{ data: T[], pagination: { total, page, limit, pages } }`

The API provides pagination via `request.pagination` (Fastify plugin). Frontend uses `usePaginatedApi` hook or fetches all data client-side (providers page loads `?limit=10000` then sorts with TanStack Table).

## Frontend Patterns

### Data Fetching
- `useApi<T>(url)` — SWR wrapper with 5-min refresh, returns `{ data, isLoading, error }`
- `usePaginatedApi<T>(url)` — adds pagination state management
- `useChainNames()` — fetches `/lava/specs` and returns a `getName(chainId)` lookup
- API base URL from `NEXT_PUBLIC_API_URL`, testnet from `NEXT_PUBLIC_API_URL_TESTNET`
- Network toggle (Mainnet/Testnet pill in header) switches via `localStorage.setItem("lava-network", "testnet")`

### Key Components
- `ChainLink` — chain ID with SVG icon + link to `/chain/{specId}`. `showName` prop renders full name on top, specId below in muted text
- `ProviderLink` — provider address/moniker with Keybase avatar or letter placeholder
- `LavaAmount` — formats ulava string to LAVA with locale number formatting
- `StatCard` — metric card (label, value, optional icon)
- `SortableTable` — TanStack Table wrapper with sorting + pagination
- `Chart` — Recharts ComposedChart wrapper for time-series

### Chain Icons
- Convention-based: `/chains/{specId}.svg` with aliases in `lib/chain-icons.ts` for specIds that don't match filenames
- Fallback: letter placeholder on `onError`
- To add a new chain: drop `{name}.svg` in `public/chains/`, add alias to `ALIASES` map if specId differs

### Tables
- All tables use TanStack React Table with client-side sorting (`getSortedRowModel()`)
- Every column needs `accessorFn` for sorting to work
- Columns with BigInt values need numeric accessors: `accessorFn: (row) => Number(toBigInt(row.field))`

## Domain Knowledge

### Lava Network Concepts

| Concept | Description |
|---------|-------------|
| **Provider** | Node operator staked on one or more chains (specs). Identified by `lava@...` address. Has moniker, identity (Keybase), stake per spec, delegation, commission |
| **Spec (Chain)** | A supported blockchain network (e.g., ETH1 = Ethereum Mainnet). Has specId (uppercase) and display name |
| **Relay** | A single RPC request routed through Lava from consumer → provider. Tracked with CU (compute units) cost |
| **CU (Compute Units)** | Weight of a relay. Different RPC methods cost different CU amounts |
| **Stake** | Provider's own tokens locked per spec. In ulava |
| **Delegation** | Tokens delegated to a provider by third parties. In ulava |
| **Commission** | Percentage (integer, already a percentage — 75 means 75%) the provider takes from delegation rewards |
| **QoS** | Quality of Service scores: sync, availability, latency. Weighted averages stored in MVs |
| **Excellence QoS** | Better QoS metric — same fields prefixed with `ex` |
| **Geolocation** | Bitmask field. 0x1=US-Center, 0x2=Europe, 0x4=US-East, 0x8=US-West, 0x10=Africa, 0x20=Asia, 0x40=AU-NZ |
| **Addons** | Extra capabilities (comma-separated string from joined endpoint addons) |
| **Extensions** | Protocol extensions (comma-separated string from joined endpoint extensions) |
| **Base Specs** | Abstract specs (COSMOSSDK, ETHERMINT, TENDERMINT, IBC, COSMOSWASM, COSMOSSDK50) — not real chains, excluded from UI |
| **IPRPC** | Incentivized Public RPC — bonus rewards for specific specs |

### Token Math
- All token amounts from chain are in **ulava** (1 LAVA = 1,000,000 ulava)
- Always use `BigInt` — ulava values overflow JavaScript `Number`
- Display: divide by 1e6, format with locale (e.g., `1,234,567 LAVA`)
- Circulating supply = total supply - locked continuous vesting - locked periodic vesting - 5 reward pools

### Chain Display Names
- `rpc/lava.ts` has a `CHAIN_DISPLAY_NAMES` override map for chains that need custom names (BSC→"BNB Chain Mainnet", ETH1→"Ethereum Mainnet", etc.)
- Fallback: `titleCase(chainName)` from chain RPC
- Mainnet/Testnet suffix comes from chain name or is part of the override

### Provider Detail Data Flow
The provider detail page (`/providers/:addr`) is expensive — it queries **every spec** on chain to find which ones the provider is staked on. This is done via `fetchAllSpecs()` then `fetchProvidersForSpec(specId)` for each spec, in batches of 5 to avoid rate limiting. The results are combined into a stakes array.

`fetchAllProviders()` does the same but also deduplicates by address and sums up totalStake/totalDelegation across all specs.

## Gotchas — Things That Have Burned Us

| Trap | Reality |
|------|---------|
| Commission values | Already percentages from chain (75 = 75%). Do NOT multiply by 100 |
| Token amounts | In ulava (1 LAVA = 1,000,000 ulava). Use `BigInt` — `Number` overflows |
| Materialized views | Must use `mvRelayDailies` / `mvConsumerRelayDailies` for aggregates. Raw `relayPayments` (18.8M rows) will timeout |
| MV date filters | Use `Date` type with `YYYY-MM-DD` format, NOT `Datetime` / ISO |
| QoS computation | Weighted: `qosSyncW / qosWeight`, not simple average |
| Geolocation | Bitmask, not enum. A provider can be in multiple regions |
| Base specs | COSMOSSDK, COSMOSSDK50, COSMOSWASM, ETHERMINT, TENDERMINT, IBC — exclude from chain lists |
| React hooks | All `useMemo`/`useState`/`useApi` calls MUST come before conditional early returns |
| `next dev` + standalone | `output: "standalone"` crashes `next dev`. Docker dev mounts `next.config.dev.ts` without it |
| Provider detail perf | Queries every spec on chain — inherently slow. Cache is essential (300s TTL) |
| `delegate_commission` | API returns camelCase `delegateCommission`, not snake_case |
| Batch size for RPC | Fetch provider data in batches of 5 specs to avoid rate limiting on public RPC |
| Reward pools | Exactly 5 named pools. If Lava adds more, `fetchRewardPoolsAmount()` needs updating |
| Vesting calculation | ContinuousVesting uses linear interpolation between start/end time. PeriodicVesting sums future periods. Must paginate through ~53K accounts |

## Environment Variables

| Variable | Default | Used by |
|----------|---------|---------|
| `API_PORT` | `8080` | API |
| `API_HOST` | `0.0.0.0` | API |
| `INDEXER_GRAPHQL_URL` | `http://localhost:3000` | API |
| `REDIS_URL` | (none, cache disabled) | API |
| `LAVA_REST_URL` | `https://lava.rest.lava.build` | API |
| `LAVA_RPC_URL` | `https://lava.tendermintrpc.lava.build:443` | API |
| `ENABLE_HEALTH_PROBE` | `false` | API |
| `HEALTH_PROBE_REGION` | `Local` | API |
| `HEALTH_PROBE_INTERVAL_MS` | `30000` | API |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8080` | Web |
| `NEXT_PUBLIC_API_URL_TESTNET` | same as above | Web |
| `NODE_ENV` | `production` | Web |

## Not Covered (external data sources needed)

- **Provider errors** — requires Relays DB (`lava_report_error` table), not in SubQuery indexer
- **Optimizer metrics** — requires Relays DB (`aggregated_consumer_optimizer_metrics`), not in indexer
- **Logpush endpoints** (`stats`, `entries`) — separate Cloudflare Logpush service
- **Full validator list** — `/validators` returns empty `data: []`, only has staking pool info

## Claude Configuration

See `.claude/` for team-shared settings, commands, rules, agents, skills, and hooks:

### Settings & Permissions
- `.claude/settings.json` — team permissions + hooks (committed)
- `CLAUDE.local.md` — personal overrides (gitignored)

### Rules (auto-loaded context)
- `.claude/rules/api-conventions.md` — auto-loads when editing `apps/api/**`
- `.claude/rules/frontend.md` — auto-loads when editing `apps/web/**`
- `.claude/rules/code-style.md` — TypeScript, React, Tailwind conventions (always loaded)
- `.claude/rules/testing.md` — Vitest patterns (always loaded)
- `.claude/rules/git-workflow.md` — Commit conventions, branching, PR workflow (always loaded)

### Commands (slash commands)
- `/project:fix-issue <number>` — Fetch GitHub issue, analyze, implement fix, run tests
- `/project:fix-pr` — Fetch unresolved PR review comments, fix them all
- `/project:deploy [target]` — Pre-deploy checks + push + PR
- `/project:context-prime` — Prime context at session start or after compaction

### Hooks (automated checks)
- **PostToolUse (Write|Edit)** — Runs `pnpm typecheck` on the affected package after every file edit. Catches TypeScript errors immediately instead of letting them compound.

## Harness: Code Review

**Goal:** Comprehensive parallel code review that catches architecture, security, performance, and style issues before merge.

**Agents:**
| Agent | Role |
|-------|------|
| arch-reviewer | Data flow, separation of concerns, API contracts, dependency direction, domain model integrity |
| security-reviewer | Injection vectors, secrets exposure, input validation, SSRF, dependency risks, Docker security |
| perf-reviewer | N+1 queries, unbounded fetches, missing caches, React re-renders, bundle bloat, BigInt misuse |
| style-reviewer | TypeScript strictness, React patterns, Tailwind conventions, API conventions, domain correctness |
| refactor-planner | Plans refactoring strategies before execution (standalone, not part of review fan-out) |

**Skills:**
| Skill | Purpose | Used by |
|-------|---------|---------|
| code-review | Orchestrator — fans out to 4 agents in parallel, merges findings into unified report | All review agents |

**Execution rules:**
- For code review, quality checks, PR review, or pre-push gates → use the `code-review` skill to run the parallel agent review
- Simple questions about code or quick checks → answer directly without agents
- All review agents use `model: "opus"` and are read-only (no write access)
- Intermediate results stored in `_workspace/` directory
- Re-reviews only re-run agents whose domain has new changes

**Directory structure:**
```
.claude/
├── agents/
│   ├── arch-reviewer.md
│   ├── security-reviewer.md
│   ├── perf-reviewer.md
│   ├── style-reviewer.md
│   └── refactor-planner.md
├── skills/
│   └── code-review/
│       ├── SKILL.md
│       └── references/
│           └── lava-domain.md
├── commands/
│   ├── fix-issue.md
│   ├── fix-pr.md
│   ├── deploy.md
│   └── context-prime.md
├── rules/
│   ├── api-conventions.md
│   ├── frontend.md
│   ├── code-style.md
│   ├── testing.md
│   └── git-workflow.md
└── hooks/
    └── typecheck-on-edit.sh
```

**Change log:**
| Date | Change | Target | Reason |
|------|--------|--------|--------|
| 2026-04-06 | Initial harness build | All agents + orchestrator | Parallel code review with domain-specific Lava rules |
| 2026-04-06 | Replaced code-reviewer + security-auditor | agents/ | Superseded by specialized 4-agent fan-out |
| 2026-04-06 | Removed /project:review command | commands/ | Superseded by code-review orchestrator skill |
