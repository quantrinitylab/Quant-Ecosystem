# syntax=docker/dockerfile:1
# ============================================================================
# @quant/search-indexer — Kafka → search/vector indexer + health server (:3022)
# Multi-stage pnpm-monorepo build (mirrors services/ws-gateway/Dockerfile).
# ============================================================================
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./

# Transitive @quant closure: common, health-server, quant-tools, ai, search + service
COPY packages/common/ ./packages/common/
COPY packages/health-server/ ./packages/health-server/
COPY packages/quant-tools/ ./packages/quant-tools/
COPY packages/ai/ ./packages/ai/
COPY packages/search/ ./packages/search/
COPY services/search-indexer/ ./services/search-indexer/

RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm --filter @quant/search-indexer... build

RUN node -e " \
  const fs=require('fs'); \
  for (const p of ['packages/common','packages/health-server','packages/quant-tools','packages/ai','packages/search','services/search-indexer']) { \
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
COPY --from=builder /app/packages/quant-tools/dist/ ./packages/quant-tools/dist/
COPY --from=builder /app/packages/quant-tools/package.json ./packages/quant-tools/package.json
COPY --from=builder /app/packages/ai/dist/ ./packages/ai/dist/
COPY --from=builder /app/packages/ai/package.json ./packages/ai/package.json
COPY --from=builder /app/packages/search/dist/ ./packages/search/dist/
COPY --from=builder /app/packages/search/package.json ./packages/search/package.json
COPY --from=builder /app/services/search-indexer/dist/ ./services/search-indexer/dist/
COPY --from=builder /app/services/search-indexer/package.json ./services/search-indexer/package.json

RUN pnpm install --frozen-lockfile --prod --ignore-scripts

ENV NODE_ENV=production
ENV HEALTH_PORT=3022
USER quant
EXPOSE 3022
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD nc -z localhost 3022 || exit 1
CMD ["node", "services/search-indexer/dist/main.js"]
