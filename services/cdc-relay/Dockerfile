# syntax=docker/dockerfile:1
# ============================================================================
# @quant/cdc-relay — CDC outbox → Kafka relay (worker + health server :3024)
# Multi-stage pnpm-monorepo build (mirrors services/ws-gateway/Dockerfile).
# ============================================================================
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

# Workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./

# Transitive @quant closure for cdc-relay: common, health-server + the service
COPY packages/common/ ./packages/common/
COPY packages/health-server/ ./packages/health-server/
COPY services/cdc-relay/ ./services/cdc-relay/

RUN pnpm install --frozen-lockfile --ignore-scripts

# Compile the service + its workspace deps (topological order via `...`)
RUN pnpm --filter @quant/cdc-relay... build

# Point package main/types at compiled output so the runner resolves dist, not src
RUN node -e " \
  const fs=require('fs'); \
  for (const p of ['packages/common','packages/health-server','services/cdc-relay']) { \
    const f=p+'/package.json'; const j=JSON.parse(fs.readFileSync(f,'utf8')); \
    if (j.main&&j.main.startsWith('src/')) j.main=j.main.replace('src/','dist/').replace(/\.ts$/,'.js'); \
    if (j.types&&j.types.startsWith('src/')) j.types=j.types.replace('src/','dist/').replace(/\.ts$/,'.d.ts'); \
    fs.writeFileSync(f, JSON.stringify(j,null,2)+'\n'); \
  }"

FROM node:22-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 quant
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY --from=builder /app/packages/common/dist/ ./packages/common/dist/
COPY --from=builder /app/packages/common/package.json ./packages/common/package.json
COPY --from=builder /app/packages/health-server/dist/ ./packages/health-server/dist/
COPY --from=builder /app/packages/health-server/package.json ./packages/health-server/package.json
COPY --from=builder /app/services/cdc-relay/dist/ ./services/cdc-relay/dist/
COPY --from=builder /app/services/cdc-relay/package.json ./services/cdc-relay/package.json

RUN pnpm install --frozen-lockfile --prod --ignore-scripts

ENV NODE_ENV=production
ENV HEALTH_PORT=3024
USER quant
EXPOSE 3024
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD nc -z localhost 3024 || exit 1
CMD ["node", "services/cdc-relay/dist/index.js"]
