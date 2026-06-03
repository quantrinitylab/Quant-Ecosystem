FROM node:22-slim AS deps
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY packages/common/package.json ./packages/common/package.json
COPY packages/auth/package.json ./packages/auth/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/notifications/package.json ./packages/notifications/package.json
COPY packages/search/package.json ./packages/search/package.json
COPY packages/server-core/package.json ./packages/server-core/package.json
COPY packages/shared-ui/package.json ./packages/shared-ui/package.json
COPY apps/admin/package.json ./apps/admin/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS builder
COPY packages/ ./packages/
COPY apps/admin/ ./apps/admin/
RUN pnpm turbo build --filter=@quant/admin

FROM node:22-slim AS runner
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 quantapp
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3100

COPY --from=builder --chown=quantapp:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=quantapp:nodejs /app/packages/ ./packages/
COPY --from=builder --chown=quantapp:nodejs /app/apps/admin/ ./apps/admin/
COPY --from=builder --chown=quantapp:nodejs /app/package.json ./package.json
COPY --from=builder --chown=quantapp:nodejs /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

USER quantapp
EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3100/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" || exit 1

CMD ["npx", "next", "start", "apps/admin", "-p", "3100"]
