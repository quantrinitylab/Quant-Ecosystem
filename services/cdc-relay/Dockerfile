# syntax=docker/dockerfile:1
# ============================================================================
# @quant/cdc-relay — outbox relay (worker + health server :3024)
# ============================================================================
#
# This image could not build, and then could not boot. Both causes are worth
# recording because they are properties of the monorepo, not of this service.
#
# 1. `@quant/database` is a declared dependency (the poller opens a PrismaClient
#    to drain `outbox_events`) but the workspace package was never COPYed, so
#    `pnpm install --frozen-lockfile` failed on a missing workspace link.
#
# 2. Shipping raw `tsc` output does not run. The monorepo compiles with
#    `moduleResolution: bundler`, so emitted specifiers stay extensionless —
#    `@quant/database`'s dist does `export { prisma } from './client'`, which
#    Node's ESM resolver rejects with ERR_MODULE_NOT_FOUND on
#    `/app/packages/database/dist/client`. `infra/scripts/build-backend.mjs`
#    states this outright: raw tsc/tsx output cannot run under Node's ESM
#    resolver, which is why every runnable backend in this repo is bundled.
#
# So this image bundles with the same script the app backends use. One
# self-contained ESM file, with only native/generated packages left external
# (@prisma/client + its query engine) and provided by node_modules.
#
# Prisma on Alpine needs `openssl` and `libc6-compat`: the query engine picks its
# binary by detecting libssl at runtime, and musl images ship neither, so without
# them it guesses or fails to load.
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY patches/ ./patches/
# Transitive @quant closure for cdc-relay, plus the bundler script.
COPY packages/common/ ./packages/common/
COPY packages/health-server/ ./packages/health-server/
COPY packages/database/ ./packages/database/
COPY services/cdc-relay/ ./services/cdc-relay/
COPY infra/scripts/ ./infra/scripts/
RUN pnpm install --frozen-lockfile --ignore-scripts
# The generated client is not in the repo, and the bundle keeps @prisma/client
# external, so it has to exist before bundling and again at runtime.
RUN npx prisma@6.19.3 generate --schema=packages/database/prisma/schema.prisma
RUN node infra/scripts/build-backend.mjs services/cdc-relay src/index.ts services/cdc-relay/dist/index.mjs

FROM node:22-alpine AS runner
WORKDIR /app
# See the builder note: this is the stage the query engine actually runs in.
RUN apk add --no-cache openssl libc6-compat
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 quant
ENV NODE_ENV=production
ENV HEALTH_PORT=3024
# Redis Streams, not Kafka: staging runs Redis and no Kafka. Overridable.
ENV EVENT_TRANSPORT=redis
# node_modules carries the externals the bundle require()s — @prisma/client and
# its generated client + engine. Copied whole from the builder so the generated
# output stays where pnpm put it (it lives in the store, not node_modules/.prisma).
COPY --from=builder --chown=quant:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=quant:nodejs /app/packages/database/ ./packages/database/
# The WHOLE service directory, not just dist/. pnpm links a package only into
# whatever declares it, so `@prisma/client` lives at
# services/cdc-relay/node_modules/@prisma/client — a symlink into the root
# .pnpm store. Copying only dist/ left that behind and the bundle died with
# "Cannot find package '@prisma/client' imported from .../dist/index.mjs", even
# though the root node_modules was present. The app Dockerfiles copy their whole
# app directory for exactly this reason.
COPY --from=builder --chown=quant:nodejs /app/services/cdc-relay/ ./services/cdc-relay/
COPY --from=builder --chown=quant:nodejs /app/package.json ./package.json
COPY --from=builder --chown=quant:nodejs /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
USER quant
EXPOSE 3024
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD nc -z localhost 3024 || exit 1
CMD ["node", "services/cdc-relay/dist/index.mjs"]
