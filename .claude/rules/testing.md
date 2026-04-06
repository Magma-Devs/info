# Testing

## Framework
- Vitest for unit/integration tests
- Test files colocated as `__tests__/*.test.ts` within app directories

## Conventions
- Test the public API, not internals
- Mock external HTTP calls (chain RPC, indexer GraphQL) — never hit real endpoints in tests
- Use `BigInt` literals in assertions for token amounts
- Run `pnpm test` to execute all tests, `pnpm --filter @info/api test` for API only

## What to test
- API route handlers: request/response shape, edge cases, error responses
- Utility functions: `formatNumber`, `formatNumberKMB`, token conversion helpers
- Do NOT test React components with unit tests — rely on TypeScript typechecking instead
