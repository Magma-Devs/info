---
description: Comprehensive review — build, typecheck, security, and code quality
---

Run a full review of the current changes covering build verification, type safety, security, and code quality.

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
- GraphQL injection (user input interpolated into query strings instead of using variables)
- Missing input validation on API route params and query strings
- Secrets or credentials in Docker build args, env defaults, or committed .env files
- Dependencies with known vulnerabilities (`pnpm audit` if applicable)

## 3. Code Quality

For each changed file, check:
- TypeScript strict mode compliance (no `any`, no unsafe `as` casts without justification)
- React hooks rules (all hooks before conditional early returns, proper dependency arrays)
- API routes: using materialized views for aggregates (never raw relayPayments), proper cacheTTL, pagination convention
- Token amounts use `BigInt` (not `Number`) — ulava values overflow Number.MAX_SAFE_INTEGER
- Commission values treated as integer percentages (75 = 75%), not multiplied by 100
- No hardcoded URLs — all external endpoints via env vars
- Tailwind: semantic color tokens (text-foreground, bg-card), no inline styles
- TanStack Table columns have `accessorFn` for sorting to work
- Base specs (COSMOSSDK, ETHERMINT, etc.) excluded from chain lists

## 4. Output

Summarize findings as:
- **Build**: pass/fail with errors
- **Security**: list of findings with severity (critical/high/medium/low)
- **Code quality**: list of issues with severity (critical/warning/nit)
- **Overall verdict**: Approve, Request Changes, or Comment
