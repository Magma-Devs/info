# Git & PR Workflow

## Commits
- Use conventional commit format: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Keep commits atomic — one logical change per commit
- Write the "why" in the commit body if the diff doesn't make it obvious

## Branches
- Feature branches: `feat/<short-description>`
- Bug fixes: `fix/<short-description>`
- Always branch from `main`

## Pull Requests
- PR title under 70 characters, conventional commit style
- PR body: summary bullets, test plan, breaking changes if any
- One logical change per PR — split large changes into stacked PRs when sensible
- Run `/project:review` before pushing

## Before pushing
- `pnpm typecheck` must pass
- `pnpm test` must pass
- No hardcoded secrets, API keys, or connection strings in the diff
