---
description: Fix a GitHub issue by number
argument-hint: "<issue-number>"
---

Fix the GitHub issue: $ARGUMENTS

## Steps

1. Fetch issue details: `gh issue view $ARGUMENTS`
2. Understand the bug or feature request from the description and comments
3. Find the relevant files using search and code reading
4. Implement the fix or feature
5. Run `pnpm typecheck` to verify no type errors
6. Run `pnpm test` to verify tests pass
7. Summarize what was changed and why
