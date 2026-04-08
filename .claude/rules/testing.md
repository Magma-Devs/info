# Testing

## Framework
- Vitest for unit/integration tests
- Test files colocated as `__tests__/*.test.ts` within app directories

## Conventions
- Test the public API, not internals
- Mock external HTTP calls (chain RPC, indexer GraphQL) — never hit real endpoints in tests
- Mock Redis with in-memory Map when testing health-store or cache logic
- Use `BigInt` literals in assertions for token amounts
- Run `pnpm test` to execute all tests, `pnpm --filter @info/api test` for API only

## What to test
- API route handlers: request/response shape, edge cases, error responses
- Utility functions: `formatNumber`, `formatNumberKMB`, token conversion helpers
- Do NOT test React components with unit tests — rely on TypeScript typechecking instead

## When to write tests
- **Every new service or utility module MUST have tests** — no exceptions
- **Every new API route** should have at least a happy-path test
- **Bug fixes** should include a regression test
- **Security-sensitive code** (input validation, SSRF filters) MUST have tests covering both allow and deny cases
- If you add code but no tests, the PR is incomplete
