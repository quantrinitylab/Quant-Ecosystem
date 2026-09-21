# syntax=docker/dockerfile:1
# ============================================================================
# @quant/cdc-relay — outbox relay (worker + health server :3024)
# ============================================================================
#
# Mirrors apps/quantube/Dockerfile.backend deliberately. This service had never
# run, and getting it to boot surfaced four separate defects — all of them
# properties of this monorepo rather than of the relay, and all of them already
# solved in the app backend images:
#
# 1. `@quant/database` is a declared dependency (the poller opens a PrismaClient
#    to drain `outbox_events`) but the workspace package was never COPYed, so
#    `pnpm install --frozen-lockfile` failed on a missing workspace link.
#
# 2. Raw `tsc` output does not run. Everything compiles with
#    `moduleResolution: bundler`, so emitted specifiers stay extensionless:
#    @quant/database's dist does `export { prisma } from './client'`, which
#    Node's ESM resolver rejects. infra/scripts/build-backend.mjs says this in
#    its own header — which is why every runnable backend here is bundled.
#
# 3. pnpm links a dependency only into whatever declares it, so copying just
#    `dist/` left `services/cdc-relay/node_modules/@prisma/client` behind and the
#    bundle could not resolve its one external. The whole service directory has
#    to come across.
#
# 4. Alpine was the wrong base. Every deployable in this repo runs `node:22-slim`
#    with apt `openssl`; cdc-relay was the only musl image, and on musl the
#    generated Prisma client + query engine did not come through usably. Matching
#    the proven base removes a variable rather than fighting it.
#
# openssl is not optional: Prisma's query engine picks its binary by detecting
# the libssl version at runtime and node:22-slim ships none, so without it the
# engine guesses. Installed in BOTH stages — `prisma generate` runs in the
# builder and decides which engine is baked in, and the runner is where it runs.
FROM node:22-slim AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json turbo.json ./
COPY patches/ ./patches/
# Transitive @quant closure for cdc-relay, plus the bundler script.
COPY packages/common/ ./packages/common/
COPY packages/health-server/ ./packages/health-server/
COPY packages/database/ ./packages/database/
COPY services/cdc-relay/ ./services/cdc-relay/
COPY infra/scripts/ ./infra/scripts/
RUN pnpm install --frozen-lockfile --ignore-scripts --network-concurrency 1 --child-concurrency 1

FROM deps AS builder
ENV NODE_OPTIONS="--max-old-space-size=2048"
# The generated client is not in the repo, and the bundle keeps @prisma/client
# external, so it must exist before bundling and again at runtime.
RUN npx prisma@6.19.3 generate --schema=packages/database/prisma/schema.prisma
RUN node infra/scripts/build-backend.mjs services/cdc-relay src/index.ts services/cdc-relay/dist/index.mjs

FROM node:22-slim AS runner
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 quantapp
WORKDIR /app
ENV NODE_ENV=production
ENV HOME=/tmp
ENV HEALTH_PORT=3024
# Redis Streams, not Kafka: staging runs Redis and no Kafka. Overridable.
ENV EVENT_TRANSPORT=redis

COPY --from=builder --chown=quantapp:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=quantapp:nodejs /app/packages/ ./packages/
COPY --from=builder --chown=quantapp:nodejs /app/services/cdc-relay/ ./services/cdc-relay/
COPY --from=builder --chown=quantapp:nodejs /app/package.json ./package.json
COPY --from=builder --chown=quantapp:nodejs /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

USER quantapp
EXPOSE 3024

# The health server answers on /healthz (see @quant/health-server), and this is a
# worker with no other HTTP surface.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3024/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" || exit 1

CMD ["node", "services/cdc-relay/dist/index.mjs"]
