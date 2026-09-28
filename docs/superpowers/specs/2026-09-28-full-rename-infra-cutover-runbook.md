# Full Physical Rename + Infra Cutover Runbook

**Status:** Authorized by owner 2026-09-28 (chose "Full physical rename incl. infra").
**Branch:** `restructure/phase3-cleanup-rename`
**Scope:** Rename the three apps whose folder + infra resource names still use legacy
strings, all the way through to live staging infrastructure.

| Legacy (folder + infra) | Product / target name | Package name (already done) |
| ----------------------- | --------------------- | --------------------------- |
| `apps/quantsync`        | **QuantWave**         | `@quant/quantwave`          |
| `apps/quantneon`        | **QuantGram**         | `@quant/quantgram`          |
| `apps/quantedits`       | **QuantCooks**        | `@quant/quantcooks`         |

## What is ALREADY done (do not redo)

The *logical* rebrand landed in an earlier wave ("Wave E"). Verified:

- **Package names** are already the product names: `apps/quantsync/package.json:2` =
  `@quant/quantwave`, `quantneon` = `@quant/quantgram`, `quantedits` = `@quant/quantcooks`.
  Folder rename therefore does **not** change any `@quant/*` import — downstream code is
  unaffected by the move itself.
- **`QuantApp` union** (`packages/common/src/types.ts:152-170`) lists `quantwave`,
  `quantgram`, `quantcooks` as the authoritative IDs; `quantsync`, `quantneon`,
  `quantedits` (and `quantdocs`, `quantdrive`, `quantcalendar`, `quantmeet`) remain as
  explicit **legacy/deprecated aliases** for back-compat.
- **`QUANT_APPS`** (`packages/common/src/constants.ts:8-94`) is a `Record<QuantApp,...>`
  carrying metadata for BOTH the new names and the legacy aliases.
- **Data migration** `packages/database/prisma/migrations/0061_quantapp_rebrand_backfill/migration.sql`
  backfills persisted `sourceApp`/`activeApp`/`appId`/`appSource` columns legacy→new.
- **Live hostnames** already use product names (`infra/k8s/staging-remaining-apps.yaml:9-17`):
  `apps/quantsync -> quantwave.quantrinity.in`, `quantneon -> quantgram.quantrinity.in`,
  `quantedits -> quantcooks.quantrinity.in`.

## What remains = PHYSICAL only

1. **Folder names** under `apps/`.
2. **Infra resource names**: ECR repositories, k8s Deployment/Service/Ingress names,
   `deploy-staging.yml` targets, Dockerfile paths, backend manifest filenames, SLO files.

## Execution note — refined A/B split (as executed 2026-09-28)

The A/B boundary below was refined **at execution time** to keep staging continuously
deployable. What actually landed on `restructure/phase3-cleanup-rename` is **narrower**
than the "Part A" written below: the branch carries the **folder rename + every
build/CI-critical reference + cosmetics**, and **all infra-NAME changes were pushed to
Part B** (ops), because a name change is coupled to ECR-repo creation + fresh image
digests and is not git-reversible.

**On the branch (Part A, done):**
- Folder moves `apps/quant{sync,neon,edits}` → `apps/quant{wave,gram,cooks}` (A1).
- **Build paths only** in `deploy-staging.yml`: the `dockerfile=apps/<old>/…` paths were
  repointed to the new folders (A2), but the **target keys and their `repository` /
  `deployment` / `container` values were deliberately KEPT legacy** (`quant-quantsync`
  etc.) — see A3 note below.
- All 6 Dockerfiles (`Dockerfile` + `Dockerfile.backend` per app): COPY paths, filters,
  `build-backend.mjs` args, CMD, header/prose comments.
- Load-bearing ref files: `packages/server-core/src/wiring/inventory.ts` (path strings),
  `packages/testing/src/security/snyk.ts` (manifest list), `scripts/inline-fetch-baseline.json`
  (baseline keys), the two cross-app `federation.ts` comments, the 9 intra-folder
  self-reference comment files, `constants.ts` WS_EVENTS comments (A8).
- `pnpm-lock.yaml`: the 3 importer keys renamed in place (surgical — a clean
  `pnpm install --lockfile-only` on a healthy machine will additionally re-sort keys;
  cosmetic, order-insensitive under `--frozen-lockfile`).

**Deferred to Part B (ops cutover, NOT on the branch):**
- **A3** deploy-staging target/`repository`/`deployment`/`container` NAME renames — kept
  legacy so a `deploy-staging` dispatch still resolves to live resources.
- **A4/A5** k8s manifests (`staging-remaining-apps.yaml` + the 3 `staging-*-backend.yaml`
  files): resource/label/selector/ingress renames, file renames, and fresh digests — done
  together with ECR-repo creation (below), never alone.
- **A6** SLO/observability filenames.
- **A7** backend env-var keys (still DEFER, as written).

**Why:** renaming a deploy target or k8s Deployment on the branch without the new ECR
repos + pushed images existing yet would make staging un-deployable (or ImagePullBackOff
on apply). Keeping names legacy on the branch decouples the Part-A merge from the Part-B
change window. Post-edit grep (2026-09-28) confirms the legacy infra NAMES
`quant-quant{sync,neon,edits}` are now confined to exactly: `deploy-staging.yml` (A3,
intentional), the 4 k8s files (A4/A5, deferred), and this runbook — zero elsewhere. Legacy
folder PATH strings `apps/quant{sync,neon,edits}` remain only in archived docs
(`.agents/tasks/**`, `AGENT_*`/`*HANDOFF*`, `docs/REPO_INTEGRATION_AUDIT.md`,
`LIFECYCLE_DIAGRAMS.md`, `mock-debt.csv`) + the deferred k8s file + this runbook.

## Part A — Branch-side changes (git-reversible; I execute these)

These are ordinary file edits on the feature branch. Nothing here touches live infra
until Part B is run by ops. Execute as coordinated commits.

### A1. Folder moves (do LAST among edits, after refs are staged)

```bash
git mv apps/quantsync apps/quantwave
git mv apps/quantneon apps/quantgram
git mv apps/quantedits apps/quantcooks
```

`pnpm-workspace.yaml` globs `apps/*`, so the move re-registers automatically; only
`pnpm-lock.yaml` needs regenerating (`pnpm install --lockfile-only`).

### A2. Dockerfile path references — `.github/workflows/deploy-staging.yml`

`Resolve approved target` maps each target → `dockerfile`. After the move these paths
must point at the new folders or the `test -f "$dockerfile"` guard fails:

- `apps/quantsync/Dockerfile`  → `apps/quantwave/Dockerfile`   (target `quantsync`, ~line 201)
- `apps/quantneon/Dockerfile`  → `apps/quantgram/Dockerfile`   (target `quantneon`, ~line 225)
- `apps/quantedits/Dockerfile` → `apps/quantcooks/Dockerfile`  (target `quantedits`, ~line 233)
- backend variants (`*-backend` cases, ~lines 209/229/249) — same path swap.

### A3. Deploy targets + resource names — `deploy-staging.yml`

Rename target keys and their resolved `repository` / `deployment` / `container`:

- `quantsync`  → `quantwave`  : repo `quant-quantsync`→`quant-quantwave`,
  deploy `quant-quantsync`→`quant-quantwave`.
- `quantneon`  → `quantgram`  : repo/deploy `quant-quantneon`→`quant-quantgram`.
- `quantedits` → `quantcooks` : repo/deploy `quant-quantedits`→`quant-quantcooks`.
- `-backend` variants: `quant-quantsync-backend`→`quant-quantwave-backend`, etc.
- Keep the OLD target keys as **hidden aliases** for one release if any runbook/PR
  references them, OR remove — owner may drop legacy targets since no live job uses them.

### A4. Frontend k8s manifest — `infra/k8s/staging-remaining-apps.yaml`

Rename Deployment/Service/label/selector names and ingress backends:

- `quant-quantsync`  → `quant-quantwave`  (Deployment, Service, `app:` labels, ingress backend ~line 600)
- `quant-quantneon`  → `quant-quantgram`  (…, ingress backend ~line 620)
- `quant-quantedits` → `quant-quantcooks` (…, ingress backend ~line 640)
- **Image refs pin live digests** (`…/quant-quantsync@sha256:…`). These digests live in the
  OLD ECR repos. Do NOT flip the image line to a new repo until Part B has pushed images
  there — see the ImagePullBackOff warning below. Frontend ports (3102/3104/3106) are
  fine to keep; they are internal.

### A5. Backend k8s manifests — rename the 3 files + their contents

- `infra/k8s/staging-quantsync-backend.yaml`  → `staging-quantwave-backend.yaml`
- `infra/k8s/staging-quantneon-backend.yaml`  → `staging-quantgram-backend.yaml`
- `infra/k8s/staging-quantedits-backend.yaml` → `staging-quantcooks-backend.yaml`

Inside each: Deployment/Service `quant-<x>-backend`, HPA/Ingress `quant-<x>-api-staging`,
image repo `quant-<x>-backend`. Same digest caveat as A4. Backend ports (3004/3012/3013)
stay.

### A6. SLO / observability files

Grep `packages/observability` + `infra/` for `quantsync|quantneon|quantedits` SLO/dashboard
filenames and rename to match. (Enumerate at execution time; low risk, no live dependency.)

### A7. Backend env-var keys (DECISION REQUIRED — default: DEFER)

App proxy code reads `process.env.QUANTSYNC_BACKEND_URL` / `QUANTNEON_BACKEND_URL` /
`QUANTEDITS_BACKEND_URL` (also `NEXT_PUBLIC_*` twins), and the manifests set them. These
are an **internal contract**, not product-facing. Renaming requires an atomic code+manifest
change. **Recommendation:** leave the env-var KEYS as-is in this cutover (rename folders/
resources only) to shrink blast radius; rename keys in a dedicated follow-up. If owner wants
them renamed now, change both sides together and grep-verify zero stragglers.

### A8. Cosmetic

`WS_EVENTS` comments in `constants.ts` still say "(QuantSync)/(QuantNeon)" — update to new
names. Non-load-bearing.

## Part B — Live staging cutover (NOT git-reversible; OPS runs these)

I cannot run AWS/kubectl from here. These are the ordered ops steps. **Renaming an ECR
repo or a k8s Deployment is not an in-place operation** — you create new, cut over, then
delete old.

> ⚠️ **ImagePullBackOff trap (already bitten once — see the header comment in
> `staging-remaining-apps.yaml`):** the manifests pin image *digests* that exist only in
> the OLD repos. If you `kubectl apply` a manifest whose image line points at a NEW,
> empty repo, every pod goes ImagePullBackOff. So: push images to the new repos FIRST,
> capture the NEW digests, and only then apply manifests referencing them.

**Cluster:** `quant-staging-eks` · **ns:** `quant-staging` · **ECR:**
`178313340246.dkr.ecr.us-east-1.amazonaws.com`

1. **Create new ECR repos** (IMMUTABLE + scanOnPush, matching existing policy):
   `quant-quantwave`, `quant-quantgram`, `quant-quantcooks` and each `-backend`.
2. **Build + push** images from the renamed folders to the new repos. Record the new
   `@sha256:` digests.
3. **Pin new digests** into the renamed manifests (A4/A5) — replace the old-repo digest
   lines with the freshly pushed ones.
4. **Apply** renamed Deployments/Services/HPAs (they are created new alongside the old).
5. **Verify** rollout healthy (`kubectl rollout status`, pods Running, probes green).
6. **Flip ingress** backends (A4) to the new Services; confirm the hostnames
   (`quantwave/quantgram/quantcooks.quantrinity.in`) serve from new pods.
7. **Delete old** Deployments/Services (`quant-quantsync` etc.) once traffic is confirmed.
8. **Decommission old ECR repos** after a hold period.

Roll the merge of Part A and the completion of Part B into one change window; do not merge
Part A to `main` and leave Part B undone for long, or a `deploy-staging` dispatch could
target renamed resources that don't exist yet.

## Legacy-alias policy

**Keep** the legacy IDs in the `QuantApp` union + `QUANT_APPS` (they back-compat old
persisted rows/tokens that migration 0061 is still reconciling). Shrinking the union is a
separate, later step gated on 0061 being fully applied everywhere. Do **not** delete
aliases in this cutover.

## Sequencing vs running design agents

The 5 design agents read paths this rename moves (e.g. Agent 1 reads
`apps/quantsync/backend/services/sso-login.service.ts`; the token agent reads
`packages/brand`). **Do the `git mv` (A1) and any shared-file edits only AFTER all design
agents finish** — moving a file mid-read corrupts their output. Infra files (A2–A6) are
not read by any agent and could be staged earlier, but keep the whole rename in one
coherent commit set to avoid a half-renamed tree.

## Verification (after Part A)

- `pnpm install --lockfile-only` then `pnpm -w typecheck && pnpm -w lint && pnpm -w build`.
- `pnpm --filter @quant/server-core test` — `inventory.test.ts` still asserts
  ENGINE_INVENTORY length ≥ 68 / non-deferred ≥ 60 (rename ≠ remove; count must be
  unchanged).
- Grep must return **zero** load-bearing hits for `apps/quantsync|apps/quantneon|apps/quantedits`
  and `quant-quantsync|quant-quantneon|quant-quantedits` outside archived docs.

## Rollback

Part A: `git revert` the rename commits. Part B: keep old Deployments + ECR repos until
step 7/8; if the new rollout is unhealthy, flip ingress back to the old Services (still
running) — zero-downtime rollback until decommission.

## Part A addendum — complete load-bearing ref list (from grep 2026-09-28)

Beyond A2–A6, these non-doc files reference the legacy folder paths and MUST update in the
same commit set (grep `apps/(quantsync|quantneon|quantedits)` restricted to code/config):

- **`packages/server-core/src/wiring/inventory.ts`** — ENGINE_INVENTORY carries app path
  strings. **Load-bearing:** `inventory.test.ts` asserts counts/paths; update paths so the
  count stays ≥68 / non-deferred ≥60.
- **Cross-app federation routes** — `apps/quantmail/backend/routes/federation.ts` and
  `apps/quantchat/backend/routes/federation.ts` reference `apps/quantneon`. Update.
- **`scripts/inline-fetch-baseline.json`** and **`packages/testing/src/security/snyk.ts`** —
  app-path strings (baseline + scan targets). Update.
- **Intra-folder self-references** — several files *inside* the moving folders embed their
  own path as a literal (e.g. `apps/quantneon/src/services/{sociogram-radar,api-client}.ts`,
  `src/features/*/types.ts`, `src/app/api/_lib/*-proxy.ts`, `backend/__tests__/…seam.test.ts`).
  They move with the folder but any literal `apps/quantneon` string inside needs the swap —
  grep again post-`git mv` and fix residuals.
- **Dockerfiles** — each app has BOTH `Dockerfile` and `Dockerfile.backend`; both contain
  legacy strings (COPY paths / labels). So A2/A3 backend targets use `Dockerfile.backend`,
  and the Dockerfiles' internal strings need updating too.
- **`pnpm-lock.yaml`** — regenerated, not hand-edited (`pnpm install --lockfile-only`).
- **NOT load-bearing (leave or archive):** all `.agents/tasks/**/*.json` (historical task
  manifests) and the root `AGENT_*/CTO_*/*HANDOFF*.md` docs. These do not affect build/CI.

**Execution readiness:** the above + A1–A8 is the full branch edit-set. It is gated only on
the 3 still-running design agents (super-app, token-unification, cross-platform) finishing,
since they read `apps/*` and `packages/brand`.


