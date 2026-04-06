---
description: Full pre-push gate — build, test, security, performance, and code quality
---

Run a comprehensive review of the current changes. This is the full CI-like gate to run before pushing.

## 1. Build & Type Safety

1. Run `git diff --stat` to identify all changed files
2. Run `pnpm --filter @info/api typecheck` and `pnpm --filter @info/web typecheck`
3. Run `pnpm test` to verify tests pass
4. Run `docker compose -f docker-compose.dev.yml build` to verify Docker builds succeed

## 2. Security Audit

For each changed file, scan for:
- Hardcoded secrets, API keys, tokens, passwords, or connection strings
- Command injection in any shell/exec calls
- XSS vectors in React components (dangerouslySetInnerHTML, unescaped user input)
- GraphQL injection (user input interpolated into query strings instead of using variables — must always use `$variable` syntax)
- Missing input validation on API route params and query strings (e.g., untrusted input passed to `fetchProvidersForSpec()`)
- Secrets or credentials in Docker build args, env defaults, or committed .env files
- Dependencies with known vulnerabilities (`pnpm audit` if applicable)
- SSRF risk: user-controlled URLs passed to `fetch()` or `fetchRest()`

## 3. Performance

For each changed file, check:
- N+1 queries — fetching inside a loop instead of batching (e.g., calling `fetchProvidersForSpec()` per spec should be batched in groups of 5)
- Unbounded data fetches — queries without `first`/`limit` on large tables (relayPayments, blockchainEvents)
- Missing pagination on endpoints that return large datasets
- React: unnecessary re-renders from inline object/array literals in props, missing `useMemo`/`useCallback` on expensive computations
- React: hooks creating new objects every render that are passed as deps to other hooks
- Client bundle: server-only imports leaking into `"use client"` components, large dependencies that should be dynamically imported
- API: missing `cacheTTL` on expensive routes (anything that queries chain RPC across all specs)
- GraphQL: selecting fields that aren't used in the response mapping

## 4. Code Quality

For each changed file, check:
- TypeScript strict mode compliance (no `any`, no unsafe `as` casts without justification)
- React hooks rules (all hooks before conditional early returns, proper dependency arrays)
- API routes: using materialized views for aggregates (never raw relayPayments), proper cacheTTL, pagination convention `{ data, pagination: { total, page, limit, pages } }`
- Token amounts use `BigInt` (not `Number`) — ulava values overflow Number.MAX_SAFE_INTEGER
- Commission values treated as integer percentages (75 = 75%), not multiplied by 100
- Date filters on MVs use `Date` type with `YYYY-MM-DD`, not `Datetime` or ISO
- QoS computed as weighted average (`qosSyncW / qosWeight`), not simple average
- No hardcoded URLs — all external endpoints via env vars
- Tailwind: semantic color tokens (text-foreground, bg-card), no inline styles
- TanStack Table columns have `accessorFn` for sorting to work, BigInt columns use `Number()` wrapper
- Base specs (COSMOSSDK, ETHERMINT, etc.) excluded from chain lists
- Consumer filters use `notEqualTo: ""` not `isNull: false` (MV stores empty string for null)
- Dead code: unused imports, unreachable branches, stale exports
- Consistency: same pattern used the same way across all files (response shapes, error handling, naming)

## 5. Error Handling

- API routes that call chain RPC: do they handle network failures gracefully? (timeout, ECONNREFUSED, rate limiting)
- GraphQL queries: is there error handling for when the indexer is down or returns partial data?
- Frontend: does `useApi` error state get surfaced to the user, or does the page silently show stale data?
- Provider detail: `fetchProvidersForSpec()` uses `.catch(() => null)` — verify null results are filtered before use

## 6. Output

Summarize findings as:
- **Build**: pass/fail with errors
- **Security**: findings with severity (critical/high/medium/low)
- **Performance**: findings with impact (high/medium/low)
- **Code quality**: issues with severity (critical/warning/nit)
- **Error handling**: gaps found
- **Overall verdict**: Approve, Request Changes, or Comment
