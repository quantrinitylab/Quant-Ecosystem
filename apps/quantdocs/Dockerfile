FROM node:22-slim AS deps
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json turbo.json ./
COPY packages/ ./packages/
COPY apps/quantdocs/ ./apps/quantdocs/
RUN pnpm install --frozen-lockfile --ignore-scripts --network-concurrency 1 --child-concurrency 1

FROM deps AS builder
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN npx prisma@6.19.3 generate --schema=packages/database/prisma/schema.prisma
RUN pnpm turbo build --filter=@quant/quantdocs --concurrency=1

FROM node:22-slim AS runner
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 quantapp
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3110
ENV HOME=/tmp

COPY --from=builder --chown=quantapp:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=quantapp:nodejs /app/packages/ ./packages/
COPY --from=builder --chown=quantapp:nodejs /app/apps/quantdocs/ ./apps/quantdocs/
COPY --from=builder --chown=quantapp:nodejs /app/package.json ./package.json
COPY --from=builder --chown=quantapp:nodejs /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

USER quantapp
EXPOSE 3110

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3110/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" || exit 1

CMD ["npx", "next", "start", "apps/quantdocs", "-p", "3110"]
