Deploy the application. Target: $ARGUMENTS (default: staging)

## Pre-deploy checks

1. Ensure working tree is clean: `git status`
2. Run typecheck: `pnpm typecheck`
3. Run tests: `pnpm test`
4. Verify Docker builds succeed:
   - `docker compose -f docker-compose.dev.yml build`

## Deploy

1. Confirm the target environment with the user before proceeding
2. Push the current branch to remote
3. Open or update the PR targeting `main`
4. Report the PR URL and CI status

**Never push directly to main or mainnet branches without explicit user approval.**
