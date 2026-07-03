# syntax=docker/dockerfile:1
# ============================================================================
# @quant/ci-runner — BullMQ CI worker + health server (:3021)
# Multi-stage pnpm-monorepo build (mirrors services/ws-gateway/Dockerfile).
# ============================================================================
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./

# Transitive @quant closure: common, health-server, queue, storage + the service
COPY packages/common/ ./packages/common/
COPY packages/health-server/ ./packages/health-server/
COPY packages/queue/ ./packages/queue/
COPY packages/storage/ ./packages/storage/
COPY services/ci-runner/ ./services/ci-runner/

RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm --filter @quant/ci-runner... build

RUN node -e " \
  const fs=require('fs'); \
  for (const p of ['packages/common','packages/health-server','packages/queue','packages/storage','services/ci-runner']) { \
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
COPY --from=builder /app/packages/queue/dist/ ./packages/queue/dist/
COPY --from=builder /app/packages/queue/package.json ./packages/queue/package.json
COPY --from=builder /app/packages/storage/dist/ ./packages/storage/dist/
COPY --from=builder /app/packages/storage/package.json ./packages/storage/package.json
COPY --from=builder /app/services/ci-runner/dist/ ./services/ci-runner/dist/
COPY --from=builder /app/services/ci-runner/package.json ./services/ci-runner/package.json

RUN pnpm install --frozen-lockfile --prod --ignore-scripts

ENV NODE_ENV=production
ENV HEALTH_PORT=3021
USER quant
EXPOSE 3021
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD nc -z localhost 3021 || exit 1
CMD ["node", "services/ci-runner/dist/main.js"]
