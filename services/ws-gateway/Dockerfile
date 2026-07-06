# syntax=docker/dockerfile:1
# ============================================================================
# @quant/ws-gateway — realtime WebSocket gateway
#
# The monorepo is authored for a BUNDLER (root tsconfig moduleResolution=bundler
# emits extensionless relative imports, e.g. `./websocket-server`). Running the
# raw `tsc` output with `node` fails Node's strict ESM resolution
# (ERR_MODULE_NOT_FOUND), and `--experimental-specifier-resolution=node` was
# removed in Node 22. So we BUNDLE the service into a single self-contained ESM
# file with esbuild, which resolves all workspace + npm deps at build time.
# ============================================================================
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY packages/common/ ./packages/common/
COPY packages/realtime/ ./packages/realtime/
COPY packages/health-server/ ./packages/health-server/
COPY services/ws-gateway/ ./services/ws-gateway/

RUN pnpm install --frozen-lockfile --ignore-scripts

# Bundle to one self-contained ESM file. The createRequire banner lets any
# bundled CommonJS dependency call `require` from within the ESM output.
RUN npx --yes esbuild@0.24.2 services/ws-gateway/src/main.ts \
      --bundle --platform=node --format=esm --target=node22 \
      --outfile=services/ws-gateway/dist/bundle.mjs \
      --banner:js="import{createRequire}from'module';const require=createRequire(import.meta.url);"

FROM node:22-alpine AS runner
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 quantws

COPY --from=builder /app/services/ws-gateway/dist/bundle.mjs ./bundle.mjs

ENV NODE_ENV=production
# WS_PORT is also set by the k8s deployment; kept here for local `docker run`.
ENV WS_PORT=8080
ENV HEALTH_PORT=8081
USER quantws
EXPOSE 8080 8081
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD nc -z localhost 8080 || exit 1
CMD ["node", "bundle.mjs"]
