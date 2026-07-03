# syntax=docker/dockerfile:1
# ============================================================================
# @quant/moderation-worker — BullMQ moderation consumer + health server (:3023)
# Multi-stage pnpm-monorepo build (mirrors services/ci-runner/Dockerfile).
#
# Runtime notes:
#   - Text/image moderation call OpenAI when *_API_KEY env is set; otherwise the
#     handlers FAIL CLOSED (never silently approve). No key baked into the image.
#   - Video frame extraction is ffmpeg-gated (FFMPEG_ENABLED); the default
#     alpine image ships no ffmpeg, so video jobs FAIL CLOSED unless a
#     ffmpeg-provisioned image/env is used (needs-staging).
# ============================================================================
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./

# Transitive @quant closure for moderation-worker:
#   common, data-plane, health-server, moderation, queue, security + the service
COPY packages/common/ ./packages/common/
COPY packages/data-plane/ ./packages/data-plane/
COPY packages/health-server/ ./packages/health-server/
COPY packages/moderation/ ./packages/moderation/
COPY packages/queue/ ./packages/queue/
COPY packages/security/ ./packages/security/
COPY services/moderation-worker/ ./services/moderation-worker/

RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm --filter @quant/moderation-worker... build

# Point package main/types at compiled output so the runner resolves dist, not src
RUN node -e " \
  const fs=require('fs'); \
  for (const p of ['packages/common','packages/data-plane','packages/health-server','packages/moderation','packages/queue','packages/security','services/moderation-worker']) { \
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
COPY --from=builder /app/packages/data-plane/dist/ ./packages/data-plane/dist/
COPY --from=builder /app/packages/data-plane/package.json ./packages/data-plane/package.json
COPY --from=builder /app/packages/health-server/dist/ ./packages/health-server/dist/
COPY --from=builder /app/packages/health-server/package.json ./packages/health-server/package.json
COPY --from=builder /app/packages/moderation/dist/ ./packages/moderation/dist/
COPY --from=builder /app/packages/moderation/package.json ./packages/moderation/package.json
COPY --from=builder /app/packages/queue/dist/ ./packages/queue/dist/
COPY --from=builder /app/packages/queue/package.json ./packages/queue/package.json
COPY --from=builder /app/packages/security/dist/ ./packages/security/dist/
COPY --from=builder /app/packages/security/package.json ./packages/security/package.json
COPY --from=builder /app/services/moderation-worker/dist/ ./services/moderation-worker/dist/
COPY --from=builder /app/services/moderation-worker/package.json ./services/moderation-worker/package.json

RUN pnpm install --frozen-lockfile --prod --ignore-scripts

ENV NODE_ENV=production
ENV HEALTH_PORT=3023
USER quant
EXPOSE 3023
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD nc -z localhost 3023 || exit 1
CMD ["node", "services/moderation-worker/dist/main.js"]
