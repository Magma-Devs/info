# Stage 1: Build Lava binaries (lavad + lavap)
# Use a pinned release tag or commit hash for reproducibility
FROM golang:1.23-alpine AS lava-builder
RUN apk add --no-cache git make gcc musl-dev linux-headers bash
ARG LAVA_VERSION=v3.1.0
RUN git clone --depth 1 --branch ${LAVA_VERSION} https://github.com/lavanet/lava.git /build
WORKDIR /build
RUN make build -j8 2>/dev/null || true
# Binaries land in /build/build/

# Stage 2: Node.js runtime
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/health-probe/package.json apps/health-probe/

RUN pnpm install --frozen-lockfile

COPY packages/shared/ packages/shared/
COPY apps/health-probe/ apps/health-probe/

RUN pnpm --filter @info/shared build && \
    pnpm --filter @info/health-probe build

# Stage 3: Final image
FROM node:22-alpine
RUN apk add --no-cache bash curl
WORKDIR /app

# Copy Lava binaries
COPY --from=lava-builder /build/build/lavad /usr/local/bin/lavad
COPY --from=lava-builder /build/build/lavap /usr/local/bin/lavap

# Copy app
COPY --from=builder /app/pnpm-workspace.yaml /app/pnpm-lock.yaml /app/package.json ./
COPY --from=builder /app/packages/shared/package.json /app/packages/shared/dist/ packages/shared/
COPY --from=builder /app/apps/health-probe/package.json /app/apps/health-probe/dist/ apps/health-probe/
COPY --from=builder /app/node_modules/ node_modules/
COPY --from=builder /app/apps/health-probe/node_modules/ apps/health-probe/node_modules/

# Copy health config
COPY apps/health-probe/external_configs/ apps/health-probe/external_configs/

ENV NODE_ENV=production
EXPOSE 6500
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:6500/healthz || exit 1
CMD ["node", "apps/health-probe/dist/main.js"]
