# Deploying QuantGram and QuantWave to AWS — readiness and gaps

**Apps:** `apps/quantneon` = `@quant/quantgram` · `apps/quantsync` = `@quant/quantwave`
**Status:** application code is deploy-ready; **the AWS delivery path for these two apps does not exist yet.**

This is the honest position, not a checklist of things that already work. Both apps now build,
typecheck, lint and test clean, and both ship a `Dockerfile` — but nothing in the repository can
currently deploy either one.

## What is missing (blocking)

| #   | Gap                                                                                                                                                              | Evidence                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **No deploy workflow.** No workflow references either app.                                                                                                       | `grep -rl 'quantsync\|quantneon\|quantgram\|quantwave' .github/workflows/` → no matches. `deploy.yml` is `name: Deploy QuantMail (production)` with `ECR_REPOSITORY: quant-quantmail`. |
| 2   | **Not in the production Helm chart.** `services:` defines only `ws-gateway`; the only apps named anywhere in the values file are quantai, quantchat, quantmail.  | `infra/helm/quant-platform/values.yaml`                                                                                                                                                |
| 3   | **No ECR repositories.** No `aws_ecr_repository` resource exists for either app; `deploy.yml` asserts a _pre-existing_ repo via `aws ecr describe-repositories`. | `infra/terraform/**` (38 `.tf` files)                                                                                                                                                  |

Until 1–3 exist, "make it live" cannot proceed for these two apps regardless of credentials.

## Why I could not deploy from this session

Two independent blockers:

1. **No credentials here.** `aws sts get-caller-identity` → `Unable to locate credentials`; there is
   no `~/.aws`. `terraform`, `kubectl` and `helm` are also not installed in this sandbox.
2. **By design there is no static key to supply.** Deployment authenticates via **GitHub OIDC
   federation**, assuming `arn:aws:iam::${vars.AWS_ACCOUNT_ID}:role/quant-gha-deploy`
   (`deploy.yml`). That trust only works from a GitHub Actions runner, so the deploy is _meant_ to
   run in CI — not from a laptop or an agent sandbox. Minting a long-lived access key to work
   around it would weaken the security posture the repo deliberately chose.

So the correct path is to add the missing pipeline (below) and run it from Actions.

## What you need to provide

**GitHub repository variables** (Settings → Actions → Variables):

| Variable         | Purpose                                                 |
| ---------------- | ------------------------------------------------------- |
| `AWS_ACCOUNT_ID` | Used to build the OIDC role ARN.                        |
| `K8S_NAMESPACE`  | Target namespace (staging workflow already reads this). |

**AWS side**, before the first run:

- The `quant-gha-deploy` IAM role must trust this repository via OIDC, with permissions for
  `ecr:*` (push/describe) on the new repositories and `eks:DescribeCluster` +
  Kubernetes RBAC on the target namespace.
- ECR repositories, e.g. `quant-quantgram` and `quant-quantwave`.
- The EKS cluster (`quant-production-eks`) and namespace must already exist.

**Runtime configuration** — both apps refuse to start in production without `JWT_SECRET`
(`backend/app.ts` throws), and anything Prisma-backed needs `DATABASE_URL`:

| Variable                | QuantGram | QuantWave | Notes                                              |
| ----------------------- | --------- | --------- | -------------------------------------------------- |
| `PORT`                  | `3008`    | `3004`    | Matches `infra/PORTS.md` and each `.env.example`.  |
| `JWT_SECRET`            | required  | required  | Hard failure in production if unset.               |
| `DATABASE_URL`          | required  | required  | Shared Postgres.                                   |
| `REDIS_URL`             | optional  | optional  | Rate limiting / caching.                           |
| `CORS_ORIGINS`          | required  | required  | Public origin of the app.                          |
| `QUANTNEON_BACKEND_URL` | required  | —         | Proxy target; defaults to `http://localhost:3008`. |
| `QUANTSYNC_BACKEND_URL` | —         | required  | Proxy target; defaults to `http://localhost:3004`. |
| `TRITON_URL`            | optional  | —         | Feed inference seam; defaults to local Triton.     |

> Set the `*_BACKEND_URL` variables explicitly in any environment where the Next server and the
> Fastify backend are not co-located. The localhost defaults are dev conveniences.

## Database migration — required before first deploy

QuantWave's audio Spaces add two tables. The migration is committed at
`packages/database/prisma/migrations/0069_add_audio_spaces/migration.sql` and applies with the
repo's existing command:

```bash
pnpm db:migrate    # prisma migrate deploy
```

It creates `spaces` and `space_participants` plus the `SpaceStatus` / `SpaceRole` enums, and is
written with `IF NOT EXISTS` / `duplicate_object` guards so a re-run is safe.

**Verification performed without a live database** (none was reachable from this sandbox): the
hand-written SQL was diffed against Prisma's own canonical DDL via

```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
```

and matches exactly on both tables' columns, types and defaults, both enums' labels and order, all
7 indexes, and all 3 foreign keys including `ON DELETE CASCADE`. `prisma validate` passes and
`prisma generate` emits the `space` / `spaceParticipant` delegates. **It has not been applied to a
real Postgres instance** — do that in staging first.

## Suggested order of work

1. Add `aws_ecr_repository` resources for `quant-quantgram` and `quant-quantwave`.
2. Add `services.quantgram` / `services.quantwave` blocks to `infra/helm/quant-platform/values.yaml`,
   modelled on the existing quantmail/quantchat entries, with the ports above and `/healthz` probes
   (server-core apps expose `/healthz`; only `ws-gateway` uses `/health` — see the comment in the
   values file before changing any probe path).
3. Copy `deploy-staging.yml` per app, changing only the ECR repository, deployment name and
   namespace. Deploy by **digest**, as the existing workflows do.
4. Apply migration `0069` in staging, then run the app suites against it.
5. Promote to production via a `workflow_dispatch` pinned to an exact `main` SHA, matching the
   quantmail pattern.

## Application readiness (verified in this session)

| Check                  | QuantGram            | QuantWave                                                                                |
| ---------------------- | -------------------- | ---------------------------------------------------------------------------------------- |
| `typecheck`            | pass                 | pass                                                                                     |
| `lint`                 | pass                 | pass                                                                                     |
| `test`                 | 19 files / 244 tests | 20 files / 246 tests                                                                     |
| `Dockerfile`           | present              | present                                                                                  |
| Tailwind compiles      | yes                  | yes — `tailwind.config.ts` + `postcss.config.js` were missing entirely and are now added |
| Proxy → backend wiring | consistent on `3008` | consistent on `3004`                                                                     |

Two configuration faults were fixed along the way, both of which would have produced a running
but broken deployment:

- **QuantWave** had all 40 API route handlers defaulting to `http://localhost:3003` — Next's own
  port — so the app proxied to itself instead of the backend on `3004`. Now a single shared
  constant, `src/app/api/_lib/backend.ts`, with a test forbidding re-declaration.
- **QuantGram**'s backend defaulted to `3012` while its `.env.example` and `infra/PORTS.md` both
  say `3008`, and `3012` is quantdrive's allocated port. Anyone following the documented setup got
  a broken app and a port collision. Code now matches the registry at `3008`.
