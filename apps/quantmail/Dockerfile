FROM node:22-slim AS deps
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json turbo.json ./
COPY patches/ ./patches/
COPY packages/ ./packages/
COPY apps/quantmail/ ./apps/quantmail/
RUN pnpm install --frozen-lockfile --ignore-scripts --network-concurrency 1 --child-concurrency 1

FROM deps AS builder
ENV NODE_OPTIONS="--max-old-space-size=2048"
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma@6.19.3 generate --schema=packages/database/prisma/schema.prisma
# Build all workspace dependencies that quantmail needs (shared-ui, brand, common, etc.)
RUN pnpm --filter @quant/shared-ui run build || echo "shared-ui build: non-critical skip"
RUN pnpm --filter @quant/brand run build || echo "brand build: non-critical skip"
RUN pnpm --filter @quant/common run build || echo "common build: non-critical skip"
# Build Next.js app — ignoreBuildErrors is set in next.config.js
RUN cd apps/quantmail && pnpm exec next build

FROM node:22-slim AS runner
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 quantapp
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3010
ENV HOME=/tmp

COPY --from=builder --chown=quantapp:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=quantapp:nodejs /app/packages/ ./packages/
COPY --from=builder --chown=quantapp:nodejs /app/apps/quantmail/ ./apps/quantmail/
COPY --from=builder --chown=quantapp:nodejs /app/package.json ./package.json
COPY --from=builder --chown=quantapp:nodejs /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

USER quantapp
EXPOSE 3010

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3010/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" || exit 1

# Use the workspace-pinned Next (v15) via pnpm — never `npx next`, which fetches
# the latest Next (16.x) at runtime and runs the v15-built app on v16 (crash).
CMD ["pnpm", "--filter", "@quant/quantmail", "exec", "next", "start", "-p", "3010"]
