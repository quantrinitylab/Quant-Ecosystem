FROM node:22-slim AS deps
# openssl here too: `prisma generate` runs in the builder stage that derives from
# this one, and the detection it does there decides which engine binary ends up
# in the image. See the longer note on the runner stage.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json turbo.json ./
COPY patches/ ./patches/
COPY packages/ ./packages/
COPY apps/quanttrinity/ ./apps/quanttrinity/
RUN pnpm install --frozen-lockfile --ignore-scripts --network-concurrency 1 --child-concurrency 1

FROM deps AS builder
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN npx prisma@6.19.3 generate --schema=packages/database/prisma/schema.prisma
RUN pnpm turbo build --filter=@quant/quanttrinity --concurrency=1

FROM node:22-slim AS runner
# openssl, and it is why this app would not stay up. quanttrinity reaches Prisma
# from server-side code on the request path (its middleware runs on every
# request, including the health probe), so the query engine is spawned inside
# this stage. Prisma picks its engine binary by detecting the libssl version at
# runtime and node:22-slim ships no openssl, so it logged
#
#   prisma:warn Prisma failed to detect the libssl/openssl version to use ...
#   Defaulting to "openssl-1.1.x"
#
# and then the engine died, taking the Next.js process with it: the container
# exited 0 with no error a second after "Ready", and Kubernetes restarted it
# ~300 times over 18h. The other frontends share this gap but survive it because
# nothing on their probe path touches Prisma.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.28.1 --activate
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 quantapp
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3113
ENV HOME=/tmp

COPY --from=builder --chown=quantapp:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=quantapp:nodejs /app/packages/ ./packages/
COPY --from=builder --chown=quantapp:nodejs /app/apps/quanttrinity/ ./apps/quanttrinity/
COPY --from=builder --chown=quantapp:nodejs /app/package.json ./package.json
COPY --from=builder --chown=quantapp:nodejs /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

USER quantapp
EXPOSE 3113

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3113/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" || exit 1

# Use the workspace-pinned Next (v15) via pnpm — never `npx next`, which fetches
# the latest Next (16.x) at runtime and runs the v15-built app on v16 (crash).
CMD ["pnpm", "--filter", "@quant/quanttrinity", "exec", "next", "start", "-p", "3113"]
