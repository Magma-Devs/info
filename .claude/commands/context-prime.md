---
description: Prime context with project state — use at session start or after compaction
---

Load project context to understand the current state of work.

1. Read `CLAUDE.md` for project conventions and architecture
2. Run `git log --oneline -20` to see recent work
3. Run `git status` to see current working tree state
4. Run `git diff --stat` to see uncommitted changes
5. If on a feature branch, run `git log --oneline main..HEAD` to see branch commits
6. Check for any open PRs on this branch: `gh pr view --json title,url,state,reviewDecision 2>/dev/null || echo "No PR for this branch"`
7. Summarize: current branch, recent changes, uncommitted work, and any open PR status
