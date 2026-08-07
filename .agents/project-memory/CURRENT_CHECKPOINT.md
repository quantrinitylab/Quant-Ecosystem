# Current Checkpoint

**Reconstructed:** 2026-08-07  
**Repository:** `quantrinitylabsgo/Quant-Ecosystem`  
**Last explicitly reviewed merged-main checkpoint:** `09a0a22e9aa5fe288d22987b90a6119a70f7c467`  
**Evening coordination checkpoint:** `82a0af5d4311f048179a16c33de6b6e17e35c6ac` (post-#147; see `sessions/2026-08-07-evening-staging-bootstrap-coordination.md`)

## Executive summary

The complete security, dependency, active-account infrastructure, production-v2 Helm/Terraform, Cloudflare Workers AI, and QuantMail browser-session hardening stack is merged. The evening sequence added the protected staging deploy workflow (#139), single-region-safe Terraform (#140, closing #129), the OIDC test workflow (#141), the QuantMail Dockerfile fix (#142), and the staging hostname fix (#147). The first real cloud artifact exists: a SHA-tagged QuantMail image in ECR, pushed through the EC2 instance-role path while AWS account verification blocks OIDC federation.

The repository's release boundary is materially safer, but this is not a production launch. No Terraform apply, production deployment, placeholder-secret write, or application DNS cutover occurred. Staging secrets, the one-time helm bootstrap, rollout health, and rollback proof remain blocking.

## Strategic north star

“Next NVIDIA” means owning an indispensable abstraction layer rather than attempting immediate chip fabrication. The candidate moat is:

> QuantAI + OAuth2/SSO + credits ledger + user-owned memory + trusted cross-app execution + orchestration/evaluation.

Product focus remains QuantMail, QuantChat, and QuantAI. Depth, real users, trust, deployment evidence, and coverage outrank adding more product surfaces.

## Canonical-priority boundary

`docs/EXECUTION_QUEUE.md` still owns **M11D-SHADOW-CANARY / work unit 4** as the one active engineering milestone. The merged hardening stack and the staging bootstrap are parallel readiness; they do not silently reprioritize the canonical queue. Only an explicit owner-approved queue edit may do that.

## Merged hardening sequence

| PR | Main SHA | Outcome |
| --- | --- | --- |
| #125 | `a5f2057887e1842368af4baaf65192c16b5f1c14` | Atomic refresh rotation, digest persistence, binding checks, and family revocation |
| #130 | `7fe3e25416348477c6790826b43f22ef675b5c0c` | High/critical dependency remediation, including `js-yaml` 4.3.1 |
| #137 | `cf1797c510a5bff349220c8f0e680ca4536997ee` | Legacy AWS account replaced by `266176113726` in active references |
| #131 | `a05bcfc4249a0fc392418ee053e9a5799ad40cde` | Unsafe legacy production Terraform root locked fail-closed |
| #133 | `04b9b0c845a1f32598bf2e8e70cdb5b89a9708c3` | Single-region production v2 Terraform root, approval default false |
| #134 | `42133d98d73e31b4c70ca62c583ec64b7018a419` | Fail-closed production v2 Helm profile and secret contracts |
| #135 | `8aa8fa5d911ec306229a03bb9cad9a6124ea1c7b` | Fail-closed direct Cloudflare Workers AI runtime |
| #132 | `09a0a22e9aa5fe288d22987b90a6119a70f7c467` | HttpOnly browser refresh session, exact Origin, memory-only access token, real Chromium proof |
| #136 | `fda63ecd6961737ec1236878efd78107b1aad782` | Durable project continuity (documentation-only) |
| #139 | `05d9af59b10c33a1d1534273c38775500b756dc0` | Protected staging deployment workflow |
| #140 | `b724c09e62cca905afc98db6a0283dc6389cbf04` | Single-region-safe production Terraform; closes #129 |
| #141 | `f90a4505c9235ee5d45a2b55e55d0917e1dbc714` | OIDC test workflow |
| #142 | `8b254c1947543559a52ce74f661467cc69b2679f` | QuantMail Dockerfile patches/ fix |
| #147 | `82a0af5d4311f048179a16c33de6b6e17e35c6ac` | Staging hostname drift fixed to `staging.quantrinity.in` |

## Live cloud truth

- AWS target account: `266176113726`, region `us-east-1`.
- Five immutable, scan-on-push ECR repositories exist. The first image landed 2026-08-07T14:37:06Z: `quant-quantmail` digest `sha256:bf36e8004d914af5594827fd2a23a86a50fd7fccc9cae66e98d62efdb70db575`, tagged with main SHA `8b254c1947543559a52ce74f661467cc69b2679f` (593 MB); the other four repositories remain empty.
- GitHub OIDC provider and the `quant-gha-deploy` role exist (verified by the write-capable session). The active blocker is AWS account verification, which denies `sts:AssumeRoleWithWebIdentity` account-wide; Bedrock and CloudShell share the same block. A support case is filed.
- `quant-staging-eks` is ACTIVE (Kubernetes v1.34, two node groups). `quant-production-eks` is intentionally not created (staging-first).
- Only the observed staging Redis credential secret exists; real staging application secrets and the production Cloudflare paths are the critical path.
- Cloudflare zones `quantrinity.in` and `quantmail.in` are active. SES DKIM and DMARC records are verified; SES remains in sandbox until the owner requests production access (#145).
- Zero Worker scripts are deployed. This is expected because QuantAI calls Workers AI through the direct REST API; account-level inference is verified (REST 200 on `@cf/meta/llama-3.2-1b-instruct`).
- Existing DNS/email records remain; no application cutover was made.

## Required evidence achieved for #132

- Definitive post-#135 gate passed.
- Dependency audit, action pins, memory/PostgreSQL, QuantChat coverage, and all three CodeQL analyses passed.
- Backend and focused changed-boundary typechecks passed.
- Cookie, proxy, browser-session, refresh-family, OAuth compatibility, transport, cleanup, retry, and real Chromium tests passed.
- Base and current full frontend annotations were identical, preserving inherited-debt classification.
- Temporary repair workflows were deleted before merge.
- Informational full sweep `92814996419` passed post-merge.

## What is not complete

- M11D WU4 representative live artifact and WU5 rollback evidence.
- AWS account verification (blocks OIDC STS federation, Bedrock, and CloudShell).
- Real staging secret provisioning, External Secrets wiring check, and the one-time helm bootstrap into `quant-staging` (#143).
- First staging rollout health, smoke, and rollback evidence.
- Terraform plan review and approval; `bootstrap_root_approved` remains false; production EKS intentionally uncreated.
- QuantAI deploy-path drift (#148) and QuantChat refresh-cookie migration (#146).
- Exact production origin validation and application DNS cutover.
- Full repository-wide blocking-green proof and inherited QuantMail frontend debt.
- Editable Figma execution and final visual-system review.

## Immediate next actions

1. [KIRO-INFRA] Provision real staging secrets and confirm the External Secrets delivery path on `quant-staging-eks`.
2. [KIRO-INFRA] Run the one-time helm bootstrap, then the digest-pinned first rollout with rollback capture.
3. [Trinity] and [Notion-MigOps] record rollout evidence; #138 remains the control room.
4. Execute M11D work unit 4 when a live shadow-capable environment exists; preserve append-only evidence.
5. Owner: request SES production access (#145) and track the AWS verification support case.
6. Do not apply Terraform, flip approvals, or change DNS until every guard passes.
