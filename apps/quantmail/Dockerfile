# Quant Docs engines: Rust → WebAssembly document renderers (see engines/README.md). BuildKit
# runs this stage in parallel with the Node stages; only its static output (.wasm/.js, the
# notices and a manifest) reaches the runtime image, under public/engines/docs/<version>/.
FROM rust:1.99.0-slim AS engines
ARG WASM_BINDGEN_VERSION=0.2.129
ARG WASM_BINDGEN_SHA256_X86_64=82d12bb940e2d4e72e0d5605387fc1b8ca179044e012b620f0ce4e7440e8320e
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/* \
 && rustup target add wasm32-unknown-unknown \
 && if [ "$(uname -m)" = "x86_64" ]; then \
      pkg="wasm-bindgen-${WASM_BINDGEN_VERSION}-x86_64-unknown-linux-musl"; \
      curl -fsSL -o /tmp/wb.tgz "https://github.com/wasm-bindgen/wasm-bindgen/releases/download/${WASM_BINDGEN_VERSION}/${pkg}.tar.gz" \
      && echo "${WASM_BINDGEN_SHA256_X86_64}  /tmp/wb.tgz" | sha256sum -c - \
      && tar -xzf /tmp/wb.tgz -C /tmp && install -m 0755 "/tmp/${pkg}/wasm-bindgen" /usr/local/bin/wasm-bindgen \
      && rm -rf /tmp/wb.tgz "/tmp/${pkg}"; \
    else \
      cargo install wasm-bindgen-cli --version "${WASM_BINDGEN_VERSION}" --locked --root /usr/local; \
    fi
WORKDIR /src/engines
COPY engines/ ./
RUN bash ./build.sh /out

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
# quanty-contracts resolves its types from dist (types: dist/index.d.ts) and is
# type-imported via @quant/quant-tools (mcp/descriptor-mapping.ts) — build it
# too, or next build fails: Cannot find module '@quant/quanty-contracts'.
RUN pnpm --filter @quant/quanty-contracts build
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
# On-device document engines, served as static files (immutable; versioned path).
COPY --from=engines --chown=quantapp:nodejs /out/ ./apps/quantmail/public/engines/docs/

USER quantapp
EXPOSE 3010

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3010/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" || exit 1

# Use the workspace-pinned Next (v15) via pnpm — never `npx next`, which fetches
# the latest Next (16.x) at runtime and runs the v15-built app on v16 (crash).
CMD ["pnpm", "--filter", "@quant/quantmail", "exec", "next", "start", "-p", "3010"]
