FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app

ARG NEXT_PUBLIC_API_URL=http://localhost:8080

# Copy everything first — ensures any file change busts the cache
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/

RUN pnpm install --frozen-lockfile

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter @info/shared build && \
    pnpm --filter @info/web build

FROM node:22-alpine
WORKDIR /app

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static apps/web/.next/static
COPY --from=builder /app/apps/web/public apps/web/public

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
