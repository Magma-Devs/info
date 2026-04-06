---
description: Fetch a GitHub issue and implement a fix with tests
---

Fix issue $ARGUMENTS

## Workflow

1. Fetch the issue details using `gh issue view <number>`
2. Read all comments for additional context: `gh api repos/{owner}/{repo}/issues/<number>/comments`
3. Analyze the issue to understand the root cause — read the relevant source files before proposing changes
4. Check if there are related issues or PRs: `gh issue list --search "<keywords>"`
5. Implement the fix:
   - Create a feature branch if not already on one: `feat/<short-description>`
   - Make the minimal change needed to fix the issue
   - Add or update tests if the fix is testable
6. Verify the fix:
   - `pnpm typecheck` — must pass
   - `pnpm test` — must pass
7. Summarize what was changed and why
