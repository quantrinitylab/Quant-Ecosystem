FROM node:22-slim AS deps
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json turbo.json ./
COPY patches/ ./patches/
COPY packages/ ./packages/
COPY apps/quantmail/ ./apps/quantmail/
RUN pnpm install --frozen-lockfile --ignore-scripts --network-concurrency 1 --child-concurrency 1

FROM deps AS builder
ENV NODE_OPTIONS="--max-old-space-size=3072"
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma@6.19.3 generate --schema=packages/database/prisma/schema.prisma
# Build critical workspace packages that quantmail imports.
# shared-ui exports from src/ which transpilePackages handles, but its own
# deps (brand, common) may need dist/ for their CJS/ESM exports.
RUN pnpm --filter @quant/common exec tsc --project tsconfig.json --noEmit false --outDir dist --declaration || true
RUN pnpm --filter @quant/brand exec tsc --project tsconfig.json --noEmit false --outDir dist --declaration || true
# Now run next build — transpilePackages handles shared-ui from source,
# and brand/common have dist/ for any CJS imports.
RUN cd apps/quantmail && pnpm exec next build
RUN rm -rf apps/quantmail/.next/cache /root/.cache /root/.pnpm-store /root/.local
RUN find /app/node_modules -type d \( -name "win32" -o -name "darwin" -o -name "win32-x64" -o -name "darwin-x64" -o -name "darwin-arm64" \) -prune -exec rm -rf {} + 2>/dev/null || true
RUN find /app/node_modules -type f \( -name "*.dll" -o -name "*.dylib" -o -name "*.exe" \) -delete 2>/dev/null || true

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
