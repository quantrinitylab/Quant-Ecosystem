# syntax=docker/dockerfile:1
# ============================================================================
# @quant/signal-projector — spine consumer (worker + health server :3025)
# ============================================================================
#
# Same shape as services/cdc-relay, and for the same hard-won reasons:
#
#  * Bundled with infra/scripts/build-backend.mjs, not shipped as raw `tsc`
#    output. The monorepo compiles with `moduleResolution: bundler`, so emitted
#    specifiers stay extensionless and Node's ESM resolver rejects them.
#  * No Prisma. This worker runs one INSERT, so it uses `pg` directly. Pulling in
#    the ORM meant pulling in a generated client and a native engine, and pnpm
#    resolved two @prisma/client store variants with `prisma generate` populating
#    only one — which is what kept cdc-relay from booting through four attempts.
#
# `pg` and `ioredis` are pure JS, so they bundle in and the runtime image is just
# the bundle: no node_modules, no openssl, nothing to resolve.
FROM node:22-slim AS deps
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json turbo.json ./
COPY patches/ ./patches/
COPY packages/common/ ./packages/common/
COPY packages/health-server/ ./packages/health-server/
COPY services/signal-projector/ ./services/signal-projector/
COPY infra/scripts/ ./infra/scripts/
RUN pnpm install --frozen-lockfile --ignore-scripts --network-concurrency 1 --child-concurrency 1

FROM deps AS builder
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN node infra/scripts/build-backend.mjs services/signal-projector src/index.ts services/signal-projector/dist/index.mjs

FROM node:22-slim AS runner
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 quantapp
WORKDIR /app
ENV NODE_ENV=production
ENV HOME=/tmp
ENV HEALTH_PORT=3025

COPY --from=builder --chown=quantapp:nodejs /app/services/signal-projector/dist/ ./services/signal-projector/dist/

USER quantapp
EXPOSE 3025

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3025/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" || exit 1

CMD ["node", "services/signal-projector/dist/index.mjs"]
