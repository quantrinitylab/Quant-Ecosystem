# syntax=docker/dockerfile:1
# ============================================================================
# @quant/smtp-inbound — inbound-mail SMTP ingestion service
#   - SMTP listener (default :2525) parses inbound mail and forwards each
#     message to INBOUND_WEBHOOK_URL (fail-closed: rejects mail when unset).
#   - HTTP health server on HEALTH_PORT (default :3025) for k8s probes.
# Multi-stage pnpm-monorepo build (mirrors services/moderation-worker/Dockerfile).
#
# @quant closure: common, health-server + the service.
# ============================================================================
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./

COPY packages/common/ ./packages/common/
COPY packages/health-server/ ./packages/health-server/
COPY services/smtp-inbound/ ./services/smtp-inbound/

RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm --filter @quant/smtp-inbound... build

# Point package main/types at compiled output so imports resolve dist, not src.
RUN node -e " \
  const fs=require('fs'); \
  for (const p of ['packages/common','packages/health-server','services/smtp-inbound']) { \
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
COPY --from=builder /app/services/smtp-inbound/dist/ ./services/smtp-inbound/dist/
COPY --from=builder /app/services/smtp-inbound/package.json ./services/smtp-inbound/package.json

RUN pnpm install --frozen-lockfile --prod --ignore-scripts

ENV NODE_ENV=production
ENV SMTP_INBOUND_PORT=2525
ENV HEALTH_PORT=3025
USER quant
EXPOSE 2525 3025
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD nc -z localhost 3025 || exit 1
CMD ["node", "services/smtp-inbound/dist/main.js"]
