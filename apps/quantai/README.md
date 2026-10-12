# QuantAI (`apps/quantai`)

QuantAI is the ecosystem's AI surface: chat with multiple models, artifacts, an agent
runtime, automations (workflow builder), memory, analytics, and cross-app tooling.
It is a Next.js 15 frontend (App Router + legacy Pages Router) with a standalone
Fastify backend in `backend/`. Identity is rooted in QuantMail — there is no local
account creation or password reset here; sign-in is "Continue with Quant Account"
(SSO ticket flow) plus email/password, and "Forgot password?" routes out to QuantMail.
The mobile client lives at `flutter_apps/apps/quant_ai`.

Live: <https://quantai.quantrinity.in>

> Product screen specs live in `docs/quant-architecture/products/quantai/README.md`
> (screens A01–A13, routes, security contracts). This file is the developer quick-start.

## Prerequisites

- Node.js 20+ and **pnpm 10.28.1** (repo `packageManager`; enable via `corepack enable`)
- Docker + Docker Compose (for local postgres/redis/qdrant via `dev:infra`)
- Git. Clone the monorepo; this app is a pnpm workspace package named `@quant/quantai`.

## Install

From the repo root (installs the whole workspace):

```sh
pnpm install --frozen-lockfile
```

> Known environment quirk (this dev VM only, not the blessed flow): in a fresh git
> worktree `pnpm install` can fail with an EPERM/chown error from the root-owned
> pnpm store. The working fallback for running vitest/tsc is to symlink the needed
> `node_modules` read-only from an existing install — e.g. inside the worktree:
> `ln -s ~/workspace/quant-ecosystem/apps/quantai/node_modules apps/quantai/node_modules`
> plus the workspace packages under test. Never symlink a repo-root `node_modules`
> (it breaks TypeScript with dual-package-identity errors).

## Environment

Copy the examples (both are checked in and authoritative):

```sh
cp apps/quantai/.env.example apps/quantai/.env
cp apps/quantai/.env.local.example apps/quantai/.env.local
```

| Variable | Where it is read | Notes |
|---|---|---|
| `PORT` | `backend/app.ts` (`getConfig`), Next.js | Frontend dev default `3003` (per `.env.example`); backend defaults to `3004` when unset |
| `JWT_SECRET` | `backend/app.ts` | Required in production (`NODE_ENV=production` fails to boot without it); dev default is a placeholder — change it |
| `REDIS_URL` | `backend/app.ts` | e.g. `redis://localhost:6379` |
| `DATABASE_URL` | Prisma | e.g. `postgresql://quant:quant@localhost:5432/quantdb` |
| `QUANTAI_BACKEND_URL` / `NEXT_PUBLIC_QUANTAI_BACKEND_URL` | `src/app/api/_lib/agent-proxy.ts` | Where the frontend API routes proxy to the standalone backend; default `http://localhost:3004` |
| `AI_PROVIDER` | AI engine | Leave empty for local provider selection; set for a production provider |
| `AI_DEFAULT_MODEL` | AI engine | e.g. `@cf/meta/llama-3.2-1b-instruct` |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_AI_MODEL` / `CLOUDFLARE_AI_BASE_URL` | Cloudflare AI path | Only when using Cloudflare inference |
| `QUANT_AI_FAIL_CLOSED` | AI engine | `true` = refuse rather than degrade on provider failure |
| `QUANTAI_MEMORY_MODE` | memory | `legacy` (default) or `shadow` |
| `QDRANT_URL` | memory v2 | e.g. `http://localhost:6333` |
| `OPENAI_API_KEY` | memory v2 | Only when memory features need it |
| `QUANT_COMMIT_SHA` / `MEMORY_POLICY_VERSION` / `MEMORY_CORPUS_VERSION` / `MEMORY_SHADOW_RETENTION_DAYS` | memory shadow | Required only when `QUANTAI_MEMORY_MODE=shadow` |

Notes:

- `QUANT_SSO_CLIENT_ID` / `QUANT_SSO_CLIENT_SECRET` are **not** app env vars — they do
  not appear anywhere in `apps/quantai` source or its `.env.example`. They are
  staging-only secrets provisioned in the deployment environment for the
  SSO ticket flow (`POST /sso/ticket/mint`, `POST /sso/ticket/resolve`).
- `SYNC_CURSOR_SECRET` belongs to the backend sync service, not this app.
- Never commit real secrets. Staging/production secrets live in the secure vault,
  never in chat or code.

## Run

Infra first (postgres with pgvector, redis, meilisearch, qdrant), from repo root:

```sh
pnpm dev:infra        # docker compose -f docker-compose.dev.yml up -d
```

Then, from repo root, start the three core apps together:

```sh
pnpm dev:core         # turbo dev --filter=@quant/quantmail --filter=@quant/quantchat --filter=@quant/quantai
```

Or run QuantAI alone, from `apps/quantai`:

```sh
pnpm dev              # next dev  → http://localhost:3003
pnpm dev:backend      # tsx backend/server.ts → Fastify on $PORT (default 3004)
```

The frontend's `/api/*` routes proxy agent calls to the backend via
`QUANTAI_BACKEND_URL` (see `src/app/api/_lib/agent-proxy.ts`).

## Test & typecheck

From `apps/quantai`:

```sh
pnpm test        # vitest run  (unit + route tests live in src/**/__tests__ and backend/__tests__)
pnpm typecheck   # tsc --noEmit (frontend) + tsc --noEmit -p tsconfig.backend.json (backend)
pnpm lint        # eslint .
```

From the repo root: `pnpm test`, `pnpm typecheck`, `pnpm lint` run the same across
the workspace via turbo.

## Conventions (lane lock)

- This lane owns `quantai/*` plus the QuantAI-dependent shared packages
  (`packages/ai`, `packages/quant-tools`, `packages/ai-memory`). Read other lanes'
  code; do not edit it.
- **PR-only to `main`.** Never push directly to `main`; never rebase, force-push,
  or squash. Never merge unless `gate`, `full-sweep`, and CodeQL are green.
  Production deploys are manual — do not trigger them.
- No fake data, fake statistics, or theater UI. If a state is empty or an API is
  unreachable, say so honestly in the UI.
- UI standard: professional dark UI everywhere; real SVG logos, never wordmarks;
  no emojis in product UI — SVG animation / WebGL instead.
- Auth/identity: QuantMail is the identity root. No local signup; password reset
  links out to QuantMail. SSO role claims are verbatim uppercase
  (`USER | ADMIN | MODERATOR | CREATOR | ADVERTISER`) — never lowercased or
  normalized.
