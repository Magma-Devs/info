Review the current changes for code quality, correctness, and adherence to project conventions.

## Steps

1. Run `git diff` to see staged and unstaged changes
2. Run `pnpm --filter @info/api typecheck` and `pnpm --filter @info/web typecheck` to check for type errors
3. For each changed file, check:
   - TypeScript strict mode compliance (no `any`, no `as` casts without justification)
   - React hooks rules (no hooks after conditional returns)
   - API routes follow caching + pagination conventions from CLAUDE.md
   - No hardcoded secrets or URLs (use env vars)
   - Tailwind classes follow project patterns (dark theme, orange accent)
4. Summarize findings as a checklist: what's good, what needs fixing
