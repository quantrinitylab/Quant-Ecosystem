# syntax=docker/dockerfile:1
# ============================================================================
# @quant/cdc-relay — outbox relay (worker + health server :3024)
# Multi-stage pnpm-monorepo build (mirrors services/ws-gateway/Dockerfile).
# ============================================================================
#
# This image could not build before. `@quant/database` is a declared dependency
# of the service (the poller opens a PrismaClient to drain `outbox_events`) but
# the workspace package was never COPYed, so `pnpm install --frozen-lockfile`
# failed on a missing workspace link. That is why the relay had a Dockerfile, a
# deploy story and tests, yet has never run anywhere.
#
# Prisma on Alpine additionally needs `openssl` and `libc6-compat`: the query
# engine picks its binary by detecting libssl at runtime, and musl images ship
# neither, so without them the engine either guesses wrong or fails to load.
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
# Workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY patches/ ./patches/
# Transitive @quant closure for cdc-relay: common, health-server, database + the service
COPY packages/common/ ./packages/common/
COPY packages/health-server/ ./packages/health-server/
COPY packages/database/ ./packages/database/
COPY services/cdc-relay/ ./services/cdc-relay/
RUN pnpm install --frozen-lockfile --ignore-scripts
# The generated Prisma client is not in the repo, so generate it before compiling
# anything that imports `@quant/database`.
RUN npx prisma@6.19.3 generate --schema=packages/database/prisma/schema.prisma
# Compile the service + its workspace deps (topological order via `...`)
RUN pnpm --filter @quant/cdc-relay... build
# Point package main/types at compiled output so the runner resolves dist, not src
RUN node -e " \
  const fs=require('fs'); \
  for (const p of ['packages/common','packages/health-server','packages/database','services/cdc-relay']) { \
    const f=p+'/package.json'; const j=JSON.parse(fs.readFileSync(f,'utf8')); \
    if (j.main&&j.main.startsWith('src/')) j.main=j.main.replace('src/','dist/').replace(/\.ts$/,'.js'); \
    if (j.types&&j.types.startsWith('src/')) j.types=j.types.replace('src/','dist/').replace(/\.ts$/,'.d.ts'); \
    fs.writeFileSync(f, JSON.stringify(j,null,2)+'\n'); \
  }"

FROM node:22-alpine AS runner
WORKDIR /app
# See the builder note: this is the stage the Prisma query engine actually runs in.
RUN apk add --no-cache openssl libc6-compat
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 quant
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY patches/ ./patches/
COPY --from=builder /app/packages/common/dist/ ./packages/common/dist/
COPY --from=builder /app/packages/common/package.json ./packages/common/package.json
COPY --from=builder /app/packages/health-server/dist/ ./packages/health-server/dist/
COPY --from=builder /app/packages/health-server/package.json ./packages/health-server/package.json
COPY --from=builder /app/packages/database/dist/ ./packages/database/dist/
COPY --from=builder /app/packages/database/package.json ./packages/database/package.json
COPY --from=builder /app/packages/database/prisma/ ./packages/database/prisma/
COPY --from=builder /app/services/cdc-relay/dist/ ./services/cdc-relay/dist/
COPY --from=builder /app/services/cdc-relay/package.json ./services/cdc-relay/package.json
RUN pnpm install --frozen-lockfile --prod --ignore-scripts
# Generate the client HERE rather than copying it from the builder.
#
# Copying `node_modules/.prisma` fails on pnpm — that path only exists under npm's
# flat layout. pnpm generates into the store, e.g.
# `node_modules/.pnpm/@prisma+client@6.19.3_.../node_modules/@prisma/client`, and
# this stage's `pnpm install --prod` builds its own store anyway, so the builder's
# copy would not be resolvable even if it were copied. Generating against the
# schema we already COPYed is both simpler and correct.
RUN npx prisma@6.19.3 generate --schema=packages/database/prisma/schema.prisma
ENV NODE_ENV=production
ENV HEALTH_PORT=3024
# Redis Streams, not Kafka: staging runs Redis and no Kafka. Overridable.
ENV EVENT_TRANSPORT=redis
USER quant
EXPOSE 3024
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD nc -z localhost 3024 || exit 1
CMD ["node", "services/cdc-relay/dist/index.js"]
