FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.json ./

# Copy relevant packages
COPY packages/common/ ./packages/common/
COPY packages/realtime/ ./packages/realtime/
COPY packages/health-server/ ./packages/health-server/
COPY services/ws-gateway/ ./services/ws-gateway/

# Install dependencies
RUN pnpm install --frozen-lockfile --ignore-scripts

# Compile TypeScript to JavaScript
RUN pnpm --filter @quant/common exec tsc -b && \
    pnpm --filter @quant/realtime exec tsc -b && \
    pnpm --filter @quant/health-server exec tsc -b && \
    pnpm --filter @quant/ws-gateway exec tsc -b

# Update main/types/exports to point to compiled output for production runtime.
# NOTE: Node's ESM resolver prefers the "exports" map over "main". Packages like
# @quant/realtime declare exports pointing at ./src/*.ts, so rewriting only
# "main" leaves the runtime resolving to source .ts files that don't exist in
# the dist-only production image (ERR_MODULE_NOT_FOUND). We therefore rewrite
# "exports" too. String helpers avoid '$' so the sh -c inline stays safe.
RUN node -e " \
  const fs = require('fs'); \
  const toDist = (s) => { \
    if (typeof s !== 'string' || !s.includes('src/')) return s; \
    s = s.replace('src/', 'dist/'); \
    if (s.endsWith('.d.ts')) return s; \
    if (s.endsWith('.ts')) return s.slice(0, -3) + '.js'; \
    return s; \
  }; \
  const walk = (v) => typeof v === 'string' ? toDist(v) : (v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, val]) => [k, walk(val)])) : v); \
  const pkgs = ['packages/common', 'packages/realtime', 'packages/health-server', 'services/ws-gateway']; \
  for (const pkg of pkgs) { \
    const p = pkg + '/package.json'; \
    const j = JSON.parse(fs.readFileSync(p, 'utf8')); \
    if (j.main && j.main.startsWith('src/')) j.main = j.main.replace('src/', 'dist/').replace('.ts', '.js'); \
    if (j.types && j.types.startsWith('src/')) j.types = j.types.replace('src/', 'dist/').replace('.ts', '.d.ts'); \
    if (j.exports) j.exports = walk(j.exports); \
    fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\\n'); \
  } \
"

FROM node:22-alpine AS runner

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 quantws

# Install pnpm for production install
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.json ./

# Copy compiled output and updated package.json from builder
COPY --from=builder /app/packages/common/dist/ ./packages/common/dist/
COPY --from=builder /app/packages/common/package.json ./packages/common/package.json
COPY --from=builder /app/packages/realtime/dist/ ./packages/realtime/dist/
COPY --from=builder /app/packages/realtime/package.json ./packages/realtime/package.json
COPY --from=builder /app/packages/health-server/dist/ ./packages/health-server/dist/
COPY --from=builder /app/packages/health-server/package.json ./packages/health-server/package.json
COPY --from=builder /app/services/ws-gateway/dist/ ./services/ws-gateway/dist/
COPY --from=builder /app/services/ws-gateway/package.json ./services/ws-gateway/package.json

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

ENV NODE_ENV=production
ENV PORT=8080

USER quantws

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD nc -z localhost 8080 || exit 1

CMD ["node", "--experimental-specifier-resolution=node", "services/ws-gateway/dist/main.js"]
