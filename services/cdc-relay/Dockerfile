# syntax=docker/dockerfile:1
# ============================================================================
# @quant/cdc-relay — outbox relay (worker + health server :3024)
# ============================================================================
#
# Small on purpose. The relay touches one table with two statements, so it needs
# a Postgres driver and nothing else: no ORM, no generated client, no native
# query engine, no `prisma generate` step, and no `packages/database`.
#
# That is not a style preference — it is what finally made this service boot.
# With Prisma, pnpm resolved TWO `@prisma/client` store variants (one for
# `@quant/database`, one for this package, differing only by the `prisma` peer);
# `prisma generate` populated one and the relay resolved the other, so the bundle
# died on `import { PrismaClient } from '@prisma/client'` no matter which base
# image, copy set, or generate placement was used. A pure-JS driver has no
# generated output and no variant to get wrong.
#
# The bundle is still produced by infra/scripts/build-backend.mjs, because raw
# `tsc` output does not run here: the monorepo compiles with
# `moduleResolution: bundler`, so emitted specifiers stay extensionless and
# Node's ESM resolver rejects them. `pg` is pure JS, so it bundles in — this
# image ships one self-contained file with no runtime externals at all.
FROM node:22-slim AS deps
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json turbo.json ./
COPY patches/ ./patches/
# Transitive @quant closure for cdc-relay, plus the bundler script.
COPY packages/common/ ./packages/common/
COPY packages/health-server/ ./packages/health-server/
COPY services/cdc-relay/ ./services/cdc-relay/
COPY infra/scripts/ ./infra/scripts/
RUN pnpm install --frozen-lockfile --ignore-scripts --network-concurrency 1 --child-concurrency 1

FROM deps AS builder
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN node infra/scripts/build-backend.mjs services/cdc-relay src/index.ts services/cdc-relay/dist/index.mjs

FROM node:22-slim AS runner
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 quantapp
WORKDIR /app
ENV NODE_ENV=production
ENV HOME=/tmp
ENV HEALTH_PORT=3024
# Redis Streams, not Kafka: staging runs Redis and no Kafka. Overridable.
ENV EVENT_TRANSPORT=redis

# Just the bundle. Nothing is external, so there is no node_modules to carry.
COPY --from=builder --chown=quantapp:nodejs /app/services/cdc-relay/dist/ ./services/cdc-relay/dist/

USER quantapp
EXPOSE 3024

# /healthz, from @quant/health-server. The previous check was `nc -z` on the
# port, which passes as soon as anything is listening and so could not tell a
# live worker from a hung one.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3024/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" || exit 1

CMD ["node", "services/cdc-relay/dist/index.mjs"]
