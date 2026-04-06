---
name: code-review
description: "Comprehensive parallel code review for the Lava Network explorer monorepo. Spawns 4 specialized agents (architecture, security, performance, code style) in parallel to review current changes, then merges all findings into a single prioritized report. Use this skill when: reviewing code before push/merge, running a full review, checking changes for issues, PR review, pre-push gate, quality check, code audit. Also handles: re-review, update review, review again, review specific files, partial review."
---

# Code Review Orchestrator

Fan-out/fan-in orchestrator that runs 4 specialized review agents in parallel on the current changes, then synthesizes a unified report.

## Phase 0: Context check

Determine execution mode:

1. Check if `_workspace/` exists with previous review results
2. Check `git diff --stat` to identify changed files
3. Decide mode:
   - `_workspace/` exists + user asks to re-review or update → **Partial re-run** (only re-run agents whose domain is affected by new changes)
   - `_workspace/` exists + user provides new changes → **Fresh run** (move `_workspace/` to `_workspace_prev/`, start over)
   - No `_workspace/` → **Initial run**

If there are no uncommitted changes, review the diff between the current branch and `main`:
```
git diff main...HEAD
```

## Phase 1: Identify scope

1. Run `git diff --name-only` (or `git diff --name-only main...HEAD` for branch review) to get the list of changed files
2. Categorize files by domain:
   - `apps/api/**` → API changes (arch, security, perf, style all apply)
   - `apps/web/**` → Frontend changes (arch, perf, style apply; security for XSS/input)
   - `packages/shared/**` → Shared code (arch, style apply)
   - `docker*`, `Dockerfile*` → Infra (security applies)
   - Other → Determine relevance
3. Skip agents whose domain has zero relevant files (e.g., don't run perf-reviewer if only docs changed)
4. Store the diff output to a temp file for agents to reference:
   ```
   git diff main...HEAD > _workspace/diff.patch
   ```

## Phase 2: Fan-out — parallel agent execution

Launch all applicable review agents in parallel using the Agent tool. Each agent is defined in `.claude/agents/` and writes its findings to `_workspace/`.

**All agents use `model: "opus"`.**

For each agent, provide this prompt structure:

```
Review the code changes in this Lava Network blockchain explorer monorepo.

Changed files:
{list of changed files from Phase 1}

Read the diff at _workspace/diff.patch to understand what changed, then read the full source files for context. Write your findings to _workspace/{agent-name}-review.md.

Focus only on your domain — other specialists handle the rest.
```

Launch these in parallel (single message, multiple Agent tool calls, all with `run_in_background: true`):

| Agent | Definition | Output file |
|-------|-----------|-------------|
| arch-reviewer | `.claude/agents/arch-reviewer.md` | `_workspace/arch-review.md` |
| security-reviewer | `.claude/agents/security-reviewer.md` | `_workspace/security-review.md` |
| perf-reviewer | `.claude/agents/perf-reviewer.md` | `_workspace/perf-review.md` |
| style-reviewer | `.claude/agents/style-reviewer.md` | `_workspace/style-review.md` |

## Phase 3: Fan-in — synthesize report

After all agents complete, read their output files and merge into a single unified report.

### Merge rules

1. **Deduplicate**: If multiple agents flag the same line/issue, keep the most specific finding
2. **Prioritize**: Order by severity across all domains:
   - CRITICAL/ERROR (blocks merge)
   - HIGH/WARNING (should fix before merge)
   - MEDIUM (fix soon)
   - LOW/NIT/INFO (optional improvements)
3. **Conflict resolution**: If agents disagree (e.g., perf says "add cache" but arch says "unnecessary complexity"), include both perspectives with a note
4. **Count**: Tally findings by severity and domain

### Report format

Write the final report to `_workspace/review-report.md` AND output it directly to the user:

```markdown
# Code Review Report

**Branch:** {branch name}
**Files changed:** {count}
**Review date:** {date}

## Verdict: APPROVE | REQUEST CHANGES | COMMENT

{1-3 sentence summary of overall assessment}

## Blocking issues ({count})

{CRITICAL and ERROR findings that must be fixed before merge}

### {title}
**Domain:** Architecture | Security | Performance | Style
**File:** `path/to/file.ts:line`
**Issue:** {description}
**Fix:** {recommendation}

## Should fix ({count})

{HIGH and WARNING findings}

## Suggestions ({count})

{MEDIUM, LOW, NIT, INFO findings — collapsed or summarized}

## Review coverage

| Domain | Agent | Findings | Status |
|--------|-------|----------|--------|
| Architecture | arch-reviewer | {count} | {ran/skipped} |
| Security | security-reviewer | {count} | {ran/skipped} |
| Performance | perf-reviewer | {count} | {ran/skipped} |
| Style | style-reviewer | {count} | {ran/skipped} |

**Total findings:** {count} ({critical} critical, {high} high, {medium} medium, {low} low)
```

## Phase 4: Cleanup

- Keep `_workspace/` for re-review support (don't delete)
- If verdict is APPROVE, congratulate briefly
- If verdict is REQUEST CHANGES, list the blocking issues as actionable items

## Error handling

- If an agent fails or times out: note it in the report as "review incomplete" for that domain, proceed with available results
- If `git diff` is empty: report "no changes to review" and exit
- If all agents are skipped (no relevant files): report "no reviewable code changes" and exit

## Test scenarios

**Normal flow:**
User has uncommitted changes to `apps/api/src/routes/providers.ts` and `apps/web/src/app/providers/page.tsx`. All 4 agents run in parallel, produce findings, orchestrator merges into unified report.

**Partial re-run:**
User fixed some issues and asks "review again". Orchestrator detects `_workspace/` exists, checks which files changed since last review, only re-runs affected agents.

**Error flow:**
Security agent times out. Report includes findings from 3 agents with a note: "Security review incomplete — agent timed out. Consider re-running."
