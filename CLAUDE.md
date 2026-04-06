# Info — Lava Network Explorer

Blockchain explorer for [Lava Network](https://lavanet.xyz). Tracks providers, chains, consumers, relays, and staking across Mainnet and Testnet.

## Quick Start

```bash
# Local dev (requires Node 22 + pnpm 10)
pnpm install && pnpm dev

# Docker dev (zero prerequisites, hot reload)
docker compose -f docker-compose.dev.yml up --build
# API → localhost:8080  |  Web → localhost:3001
```

```bash
pnpm typecheck    # type check all packages
pnpm test         # vitest
```

## Architecture

```
┌─────────────┐    GraphQL     ┌──────────────────┐    PostgreSQL    ┌─────────────┐
│  apps/web   │───────────────▶│    apps/api       │◀───────────────▶│  SubQuery    │
│  Next.js 15 │  REST :8080    │    Fastify 5      │   :3000         │  Indexer     │
│  :3001      │                │                   │                 │  (18.8M rows)│
└─────────────┘                │  Redis (cache)    │                 └─────────────┘
                               │  Chain RPC/REST   │
                               └──────────────────┘
```

**Three data sources, never mixed in a single query:**
- **Indexer GraphQL** (`INDEXER_GRAPHQL_URL`) — historical relay data via materialized views. Never query raw `relayPayments` directly.
- **Chain RPC** (`LAVA_REST_URL`, `LAVA_RPC_URL`) — real-time state: stakes, specs, supply, subscriptions.
- **Redis** (`REDIS_URL`) — response cache only. Set via route config: `{ config: { cacheTTL: 300 } }`.

## Monorepo Layout

```
apps/api/            Fastify 5 REST API (port 8080)
apps/web/            Next.js 15 App Router frontend
apps/health-probe/   Provider health writer (direct DB)
packages/shared/     Shared types and constants
```

Routes live in `apps/api/src/routes/` — one file per resource. Frontend pages mirror API structure in `apps/web/src/app/`.

## Gotchas — Things That Have Burned Us

| Trap | Reality |
|------|---------|
| Commission values | Already percentages from chain (75 = 75%). Do NOT multiply by 100. |
| Token amounts | In ulava (1 LAVA = 1,000,000 ulava). Use `BigInt` — `Number` overflows. |
| Materialized views | Must use `mvRelayDailies` / `mvConsumerRelayDailies` for aggregates. Raw `relayPayments` (18.8M rows) will timeout. |
| MV date filters | Use `Date` type with `YYYY-MM-DD` format, NOT `Datetime` / ISO. |
| QoS computation | Weighted: `qosSyncW / qosWeight`, not simple average. |
| Geolocation | Bitmask: 0x1=US-Center, 0x2=Europe, 0x4=US-East, 0x8=US-West, 0x10=Africa, 0x20=Asia, 0x40=AU-NZ |
| Base specs | `COSMOSSDK`, `COSMOSSDK50`, `COSMOSWASM`, `ETHERMINT`, `TENDERMINT`, `IBC` — exclude from chain lists, they're not real chains. |
| React hooks | All `useMemo`/`useState`/`useApi` calls MUST come before conditional early returns (`if (isLoading) return`). |
| `next dev` + standalone | `output: "standalone"` crashes `next dev`. Docker dev mounts `next.config.dev.ts` without it. |
| Circulating supply | `total - continuousVesting - periodicVesting - 5 reward pools`. See `rpc/lava.ts`. |

## Pagination Convention

All paginated endpoints: `?page=1&limit=20&sort=field&order=asc|desc`
Response shape: `{ data: T[], pagination: { total, page, limit, pages } }`

## Not Covered (external data sources)

- **Provider errors** — requires Relays DB (`lava_report_error`), not in indexer
- **Optimizer metrics** — requires Relays DB, not in indexer
- **Logpush** — separate Cloudflare service

## Claude Configuration

See `.claude/` for team-shared settings, commands, rules, and agents. Key files:
- `.claude/rules/api-conventions.md` — auto-loads when editing `apps/api/**`
- `.claude/rules/frontend.md` — auto-loads when editing `apps/web/**`
- `.claude/commands/` — `/project:review`, `/project:fix-issue`, `/project:deploy`
- `CLAUDE.local.md` — personal overrides (gitignored)
