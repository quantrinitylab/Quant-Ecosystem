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

# Install dependencies
RUN pnpm install --frozen-lockfile --ignore-scripts

# Compile TypeScript to JavaScript
RUN pnpm --filter @quant/common exec tsc -b && \
    pnpm --filter @quant/realtime exec tsc -b

# Update main fields to point to compiled output for production runtime
RUN node -e " \
  const fs = require('fs'); \
  const pkgs = ['packages/common', 'packages/realtime']; \
  for (const pkg of pkgs) { \
    const p = pkg + '/package.json'; \
    const j = JSON.parse(fs.readFileSync(p, 'utf8')); \
    if (j.main && j.main.startsWith('src/')) { \
      j.main = j.main.replace('src/', 'dist/').replace('.ts', '.js'); \
    } \
    if (j.types && j.types.startsWith('src/')) { \
      j.types = j.types.replace('src/', 'dist/').replace('.ts', '.d.ts'); \
    } \
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

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

ENV NODE_ENV=production
ENV PORT=8080

USER quantws

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD nc -z localhost 8080 || exit 1

CMD ["node", "packages/realtime/dist/websocket-server.js"]
