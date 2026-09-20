# Live status and remaining deploy work

**Apps:** `apps/quantneon` = `@quant/quantgram` · `apps/quantsync` = `@quant/quantwave`

Deployability landed in **#266** (`deploy-staging.yml` targets + `infra/k8s/staging-remaining-apps.yaml`
with real ECR image references), so the earlier "no delivery path exists" gap is closed. What
remains is getting pods actually running.

## Measured live status

Probed directly over HTTPS:

| Domain                        | HTTP    | Meaning                                  |
| ----------------------------- | ------- | ---------------------------------------- |
| `quantmail.in`                | **200** | Live — `QuantMail by QUANTRINITY`        |
| `quantchat.quantrinity.in`    | **200** | Live — `QuantChat \| Quant`              |
| `quantai.quantrinity.in`      | **200** | Live — `QuantAI \| Quant`                |
| `quantads.quantrinity.in`     | **200** | Live — `QuantAds \| Quant`               |
| `quantwave.quantrinity.in`    | 503     | DNS + ingress exist, **no healthy pods** |
| `quantgram.quantrinity.in`    | 503     | DNS + ingress exist, **no healthy pods** |
| `quantube.quantrinity.in`     | 503     | DNS + ingress exist, **no healthy pods** |
| `quantmax.quantrinity.in`     | 503     | DNS + ingress exist, **no healthy pods** |
| `quanttrinity.quantrinity.in` | 503     | DNS + ingress exist, **no healthy pods** |
| `quantedits.quantrinity.in`   | 404     | Ingress not routing this host            |
| `admin.quantrinity.in`        | 404     | Ingress not routing this host            |

**503 vs 404 matters.** A 503 means the ingress resolved the host and found no healthy endpoint —
the manifest is applied but the Deployment has no ready pod. A 404 means no ingress rule matches
the host at all. The five 503 hosts are the shortest path to "live": they need an image and a
rollout, not new infrastructure.

Also noted: `https://quantmail.in/api/health` returns a **Fastify** 404
(`{"message":"Route GET:/health not found"}`), so the backend is reachable and serving — it just
has no `/health` route on that path. Worth aligning with the probe paths the charts use
(`/healthz` for server-core apps).

## Why I cannot run the deploy from here

1. **No credentials in this environment.** `aws sts get-caller-identity` → `Unable to locate
credentials`; no `~/.aws`. `terraform`, `kubectl` and `helm` are not installed either.
2. **By design there is no static key to supply.** `deploy.yml` authenticates through **GitHub
   OIDC**, assuming `arn:aws:iam::${vars.AWS_ACCOUNT_ID}:role/quant-gha-deploy`. That trust only
   works from a GitHub Actions runner, so the deploy is _meant_ to run in CI. Minting a long-lived
   access key to bypass it would weaken the posture the repo deliberately chose.

The ECR registry in the manifests is account `178313340246` (`us-east-1`).

## Getting the five 503 hosts live

For each target (`quantsync`, `quantneon`, `quantube`, `quantmax`, `quanttrinity`):

```
Actions → "Deploy staging (OIDC)" → Run workflow
  target:      quantsync        # then quantneon, quantube, quantmax, quanttrinity
  release_sha: <40-char SHA of the protected main commit>
```

Two preconditions, both easy to get wrong:

1. **The image must already exist in ECR at that exact SHA.** The manifests pin
   `quant-<app>:<sha>`, and the production workflow deploys **by digest** after asserting the
   repository exists. If the image was never built for the SHA you pass, the rollout will sit
   unschedulable and the host keeps returning 503.
2. **`quant-staging-config` and `quant-staging-secrets` must be populated** in the namespace — every
   app block mounts both via `envFrom`.

## Runtime configuration

Both apps hard-fail without `JWT_SECRET` in production (`backend/app.ts` throws), and anything
Prisma-backed needs `DATABASE_URL`.

| Variable                   | QuantGram                          | QuantWave                          | Notes                                                          |
| -------------------------- | ---------------------------------- | ---------------------------------- | -------------------------------------------------------------- |
| `PORT`                     | `3104`                             | `3102`                             | Set explicitly by the staging manifests (container/Next port). |
| Backend dev `PORT`         | `3008`                             | `3004`                             | Local only — matches `.env.example` and `infra/PORTS.md`.      |
| `NEXT_PUBLIC_APP_URL`      | `https://quantgram.quantrinity.in` | `https://quantwave.quantrinity.in` | Already in the manifests.                                      |
| `JWT_SECRET`               | required                           | required                           | Hard failure in production if unset.                           |
| `DATABASE_URL`             | required                           | required                           | Shared Postgres.                                               |
| `CORS_ORIGINS`             | required                           | required                           | Public origin of the app.                                      |
| `QUANTNEON_BACKEND_URL`    | required                           | —                                  | Defaults to `http://localhost:3008`.                           |
| `QUANTSYNC_BACKEND_URL`    | —                                  | required                           | Defaults to `http://localhost:3004`.                           |
| `REDIS_URL` / `TRITON_URL` | optional                           | optional (`REDIS_URL` only)        | Rate limiting; feed inference seam.                            |

> Set the `*_BACKEND_URL` variables explicitly wherever the Next server and the Fastify backend are
> not co-located. The localhost defaults are dev conveniences.

## Migration required before first deploy

QuantWave's audio Spaces add two tables:

```bash
pnpm db:migrate    # prisma migrate deploy
```

`packages/database/prisma/migrations/0069_add_audio_spaces/migration.sql` creates `spaces` and
`space_participants` plus the `SpaceStatus` / `SpaceRole` enums, with `IF NOT EXISTS` /
`duplicate_object` guards so a re-run is safe.

**Verified without a live database** (none reachable here): the hand-written SQL was diffed against
Prisma's own canonical DDL via

```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
```

and matches exactly on both tables' columns, types and defaults, both enums' labels and order, all
7 indexes, and all 3 foreign keys including `ON DELETE CASCADE`. `prisma validate` passes and
`prisma generate` emits the `space` / `spaceParticipant` delegates. **It has not been applied to a
real Postgres** — run it in staging first.

## Application readiness (verified)

| Check                  | QuantGram            | QuantWave                                    |
| ---------------------- | -------------------- | -------------------------------------------- |
| `typecheck` / `lint`   | pass                 | pass                                         |
| `test`                 | 19 files / 244 tests | 20 files / 246 tests                         |
| `Dockerfile`           | present              | present                                      |
| Tailwind compiles      | yes                  | yes — config was missing entirely, now added |
| Proxy → backend wiring | consistent on `3008` | consistent on `3004`                         |

Two configuration faults fixed here, both of which would have produced a running-but-broken app:

- **QuantWave** had all 40 API route handlers defaulting to `http://localhost:3003` — Next's own
  port — so the app proxied to itself instead of the backend on `3004`. Now one shared constant
  (`src/app/api/_lib/backend.ts`) with a test forbidding re-declaration.
- **QuantGram**'s backend defaulted to `3012` while `.env.example` and `infra/PORTS.md` both say
  `3008`, and `3012` is quantdrive's allocated port. Code now matches the registry.
