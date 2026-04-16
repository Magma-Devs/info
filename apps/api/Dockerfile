FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app

# Copy everything first — ensures any file change busts the cache
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @info/shared build && \
    pnpm --filter @info/api build

FROM node:22-alpine
RUN corepack enable
WORKDIR /app

COPY --from=builder /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/package.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist/ packages/shared/dist/
COPY --from=builder /app/apps/api/package.json apps/api/
COPY --from=builder /app/apps/api/dist/ apps/api/dist/
COPY --from=builder /app/apps/api/src/proto/ apps/api/dist/proto/
COPY --from=builder /app/node_modules/ node_modules/
COPY --from=builder /app/apps/api/node_modules/ apps/api/node_modules/

ENV NODE_ENV=production
USER node
EXPOSE 8080
# `localhost` inside the container resolves to ::1 first; Fastify listens on
# 0.0.0.0 (IPv4 only) so ::1 refuses. Hit 127.0.0.1 explicitly.
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["node", "apps/api/dist/main.js"]
