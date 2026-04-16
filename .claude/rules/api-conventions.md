---
paths:
  - "apps/api/**/*.ts"
---

# API Conventions

## Route structure
- Fastify 5 with TypeScript
- Routes registered as plugins in `apps/api/src/routes/`
- Each route file exports a default async function: `export default async function (app: FastifyInstance)`

## Data sources
- **Indexer GraphQL** (`INDEXER_GRAPHQL_URL`): historical on-chain data via materialized views (`mvRelayDailies`, `mvConsumerRelayDailies`)
- **Chain RPC** (`LAVA_REST_URL`, `LAVA_RPC_URL`): real-time state (stakes, specs, supply)
- **Redis** (`REDIS_URL`): response-level cache only, never a data source

## Caching
- Set `cacheTTL` in route config: `app.get('/path', { config: { cacheTTL: 300 } }, handler)`
- TTL guidelines: health/realtime = 10-30s, lists = 60-300s, supply = 300s, avatars = 3600s
- Cache is automatic (onRequest/onSend hooks) — no explicit cache calls in handler code

## Pagination
- Standard params: `?page=1&limit=20&sort=field&order=asc|desc`
- Return shape: `{ data: T[], pagination: { total, page, limit, pages } }`

## GraphQL queries
- Use materialized views (`mvRelayDailies`, `mvConsumerRelayDailies`) for aggregate queries — never query raw `relayPayments` (18.8M rows)
- Date filters use `Date` type (`YYYY-MM-DD`), not `Datetime`
- QoS is computed from relay-weighted sums by default: `qosSyncW / qosWeight`
- Exception: `/provider-rewards` uses unweighted row-level averaging (`qosSyncSum / qosCount`) for parity with the delta reference implementation

## Swagger / OpenAPI
- Every route must include `schema.tags` and `schema.summary` so it appears in Swagger UI (`/docs`)
- When adding a new route with a new tag, also add the tag to the central list in `apps/api/src/plugins/swagger.ts`

## Chain values
- Commission values from chain are already percentages (75 = 75%), not decimals
- Token amounts are in ulava (1 LAVA = 1,000,000 ulava) — divide by 1e6 for display
- Geolocation is a bitmask: 0x1=US-Center, 0x2=Europe, 0x4=US-East, 0x8=US-West, 0x10=Africa, 0x20=Asia, 0x40=AU-NZ
