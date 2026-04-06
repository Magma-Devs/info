# Info API

Lava Network explorer API. Fastify 5 + TypeScript, pnpm monorepo.

## Architecture

No self-indexing. Two data sources:

- **Indexer (SubQuery)** — GraphQL at `INDEXER_GRAPHQL_URL` (default `http://localhost:3000`). Backed by lava-indexer-test PostgreSQL. Historical on-chain data.
- **Chain RPC** — REST at `LAVA_REST_URL`, Tendermint at `LAVA_RPC_URL`. Real-time on-chain state (stakes, specs, supply, subscriptions).
- **Redis** — Response-level cache only (`REDIS_URL`). Not a data source.

## Monorepo Layout

```
apps/api/           — REST API (Fastify 5, port 8080)
apps/web/           — Next.js frontend
apps/health-probe/  — Writes provider health to indexer DB directly
packages/shared/    — Shared types
```

## API Endpoints

### Index (prefix: `/index`)
| Method | Path | Source | Cache | Description |
|--------|------|--------|-------|-------------|
| GET | `/index/stats` | Indexer GQL + Chain RPC | 60s | Alltime + 30-day CU/relays, total stake, active providers, latest block |
| GET | `/index/top-chains` | Indexer GQL | 300s | Top 20 chains by CU |
| GET | `/index/charts?from=&to=` | Indexer GQL | 300s | Daily time-series CU/relays/QoS per chain (default 90d) |

### Providers (prefix: `/providers`)
| Method | Path | Source | Cache | Description |
|--------|------|--------|-------|-------------|
| GET | `/providers?page=&limit=` | Chain RPC | 300s | Paginated provider list sorted by stake |
| GET | `/providers/:addr` | Chain RPC | 300s | Provider detail with stakes per spec |
| GET | `/providers/:addr/stakes` | Chain RPC | 300s | Provider stakes breakdown by spec |
| GET | `/providers/:addr/health?page=&limit=` | Indexer GQL | 30s | Paginated health records |
| GET | `/providers/:addr/events?page=&limit=` | Indexer GQL | — | Paginated blockchain events |
| GET | `/providers/:addr/rewards?page=&limit=` | Indexer GQL | — | Paginated relay payment rewards |
| GET | `/providers/:addr/reports?page=&limit=` | Indexer GQL | — | Paginated provider reports |
| GET | `/providers/:addr/charts?from=&to=&chain=` | Indexer GQL | 300s | Time-series CU/relays/QoS. No params = alltime summary by chain |
| GET | `/providers/:addr/avatar` | Chain RPC + Keybase | 3600s | Provider avatar URL from Keybase identity |
| GET | `/providers/:addr/delegator-rewards` | Chain RPC | 300s | Delegator rewards from dualstaking module |
| GET | `/providers/:addr/block-reports?page=&limit=` | Indexer GQL | — | Paginated block height reports |

### Specs/Chains (prefix: `/specs`)
| Method | Path | Source | Cache | Description |
|--------|------|--------|-------|-------------|
| GET | `/specs` | Chain RPC | 300s | All specs with provider counts and total stake |
| GET | `/specs/:specId/stakes` | Chain RPC | 300s | Providers staked on this spec |
| GET | `/specs/:specId/health` | Indexer GQL | 30s | Health status distribution |
| GET | `/specs/:specId/charts?from=&to=` | Indexer GQL | 300s | Time-series CU/relays/QoS. No params = alltime summary |
| GET | `/specs/:specId/tracked-info` | Chain RPC | 300s | IPRPC spec rewards |

### Consumers (prefix: `/consumers`)
| Method | Path | Source | Cache | Description |
|--------|------|--------|-------|-------------|
| GET | `/consumers?page=&limit=` | Indexer GQL | 60s | Paginated consumers by CU usage |
| GET | `/consumers/:addr` | Indexer GQL | 30s | Consumer alltime CU/relay totals |
| GET | `/consumers/:addr/subscriptions` | Chain RPC | 300s | Active subscriptions |
| GET | `/consumers/:addr/events?page=&limit=` | Indexer GQL | — | Paginated blockchain events |
| GET | `/consumers/:addr/conflicts` | Indexer GQL | 10s | Last 100 conflict responses |
| GET | `/consumers/:addr/charts?from=&to=&chain=` | Indexer GQL | 300s | Daily time-series CU/relays/QoS per chain |

### Events (prefix: `/events`)
| Method | Path | Source | Cache | Description |
|--------|------|--------|-------|-------------|
| GET | `/events?type=events\|rewards\|reports&page=&limit=` | Indexer GQL | — | Paginated events/rewards/reports |

### Other (root-level)
| Method | Path | Source | Cache | Description |
|--------|------|--------|-------|-------------|
| GET | `/health` | — | — | Basic health check |
| GET | `/health/status` | Chain RPC | 10s | Block height + staleness check |
| GET | `/search?q=` | Chain RPC | 600s | Search providers, consumers, specs |
| GET | `/tvl` | Chain RPC | 300s | Total value locked |
| GET | `/apr` | Chain RPC | 300s | Annual percentage rate |
| GET | `/supply/total` | Chain RPC | 300s | Total supply (plain text) |
| GET | `/supply/circulating` | Chain RPC | 300s | Circulating supply (plain text) |
| GET | `/validators` | Chain RPC | 300s | Staking pool info |
| GET | `/lava/stakers` | Chain RPC | 300s | Bonded tokens |
| GET | `/lava/specs` | Chain RPC | 300s | All chain specs |
| GET | `/lava/iprpc` | Chain RPC | 300s | IPRPC (placeholder) |

## Pagination

Standard REST params: `?page=1&limit=20&sort=field&order=asc|desc`. Returns `{ data, pagination: { total, page, limit, pages } }`.

## Not covered (external data sources needed)
- **Provider errors** — requires Relays DB (`lava_report_error` table), not in indexer
- **Optimizer metrics** — requires Relays DB (`aggregated_consumer_optimizer_metrics`), not in indexer
- **Logpush endpoints** (`stats`, `entries`) — separate Cloudflare Logpush service

## Dev

```bash
pnpm install
pnpm dev          # all apps
pnpm typecheck    # type check
pnpm test         # vitest
```
