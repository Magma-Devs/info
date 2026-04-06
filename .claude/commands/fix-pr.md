---
description: Address unresolved PR review comments on the current branch
---

Fetch unresolved review comments for this branch's PR, then fix them.

## Workflow

1. Find the PR for the current branch: `gh pr view --json number,url,title`
2. Fetch all review comments: `gh api repos/{owner}/{repo}/pulls/{number}/comments`
3. Fetch the PR review threads to identify which are unresolved: `gh api repos/{owner}/{repo}/pulls/{number}/reviews`
4. For each unresolved comment:
   - Read the file and surrounding context
   - Implement the requested change
   - If the comment is unclear or you disagree, explain why and ask before changing
5. After all fixes:
   - `pnpm typecheck` — must pass
   - `pnpm test` — must pass
6. Summarize all changes made, grouped by review comment
