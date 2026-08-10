# Current Checkpoint

**Reconstructed:** 2026-08-10
**Repository:** `quantrinitylabsgo/Quant-Ecosystem`
**Last explicitly reviewed merged-main checkpoint:** `2e3a3d6b67883156e7cd4991ce0f4b53c3382d4a`
**Live QuantMail login rollout:** frontend digest `sha256:b0574a82285f567e04d64f460db3933d847c181a0867f5f2ce372dcef78f0281` on `quant-staging`

## Executive summary

PR #161 is merged and its exact-main gate passed. GitHub-hosted OIDC is proven, and the immutable QuantMail frontend image was rolled out reversibly to the `quant-staging` cluster backing `quantmail.quantrinity.in`. Internal and external invalid-login probes now return stable HTTP 400 JSON instead of the prior recursive proxy/plain-text 500.

This is not a production launch or full QuantMail feature-readiness claim. The verified live scope is the login transport boundary. A separate `fix/quantmail-feature-wiring` worktree is repairing snooze, archive/trash/restore, draft identity, and simulated editor controls; it remains candidate evidence until merged, gated, and deployed.

## Strategic north star

“Next NVIDIA” means owning an indispensable abstraction layer rather than attempting immediate chip fabrication. The candidate moat is:

> QuantAI + OAuth2/SSO + credits ledger + user-owned memory + trusted cross-app execution + orchestration/evaluation.

Product focus remains QuantMail, QuantChat, and QuantAI. Depth, real users, trust, deployment evidence, and coverage outrank adding more product surfaces.

## Canonical-priority boundary

`docs/EXECUTION_QUEUE.md` still owns **M11D-SHADOW-CANARY / work unit 4** as the one active engineering milestone. The merged hardening stack and the staging bootstrap are parallel readiness; they do not silently reprioritize the canonical queue. Only an explicit owner-approved queue edit may do that.

## Merged hardening sequence

| PR   | Main SHA                                   | Outcome                                                                                       |
| ---- | ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| #125 | `a5f2057887e1842368af4baaf65192c16b5f1c14` | Atomic refresh rotation, digest persistence, binding checks, and family revocation            |
| #130 | `7fe3e25416348477c6790826b43f22ef675b5c0c` | High/critical dependency remediation, including `js-yaml` 4.3.1                               |
| #137 | `cf1797c510a5bff349220c8f0e680ca4536997ee` | Legacy AWS account replaced by `266176113726` in active references                            |
| #131 | `a05bcfc4249a0fc392418ee053e9a5799ad40cde` | Unsafe legacy production Terraform root locked fail-closed                                    |
| #133 | `04b9b0c845a1f32598bf2e8e70cdb5b89a9708c3` | Single-region production v2 Terraform root, approval default false                            |
| #134 | `42133d98d73e31b4c70ca62c583ec64b7018a419` | Fail-closed production v2 Helm profile and secret contracts                                   |
| #135 | `8aa8fa5d911ec306229a03bb9cad9a6124ea1c7b` | Fail-closed direct Cloudflare Workers AI runtime                                              |
| #132 | `09a0a22e9aa5fe288d22987b90a6119a70f7c467` | HttpOnly browser refresh session, exact Origin, memory-only access token, real Chromium proof |
| #136 | `fda63ecd6961737ec1236878efd78107b1aad782` | Durable project continuity (documentation-only)                                               |
| #139 | `05d9af59b10c33a1d1534273c38775500b756dc0` | Protected staging deployment workflow                                                         |
| #140 | `b724c09e62cca905afc98db6a0283dc6389cbf04` | Single-region-safe production Terraform; closes #129                                          |
| #141 | `f90a4505c9235ee5d45a2b55e55d0917e1dbc714` | OIDC test workflow                                                                            |
| #142 | `8b254c1947543559a52ce74f661467cc69b2679f` | QuantMail Dockerfile patches/ fix                                                             |
| #147 | `82a0af5d4311f048179a16c33de6b6e17e35c6ac` | Staging hostname drift fixed to `staging.quantrinity.in`                                      |
| #161 | `2e3a3d6b67883156e7cd4991ce0f4b53c3382d4a` | Runtime QuantMail auth proxy; exact-main gate `31400717610` attempt 2 passed                  |

## Live cloud truth

- AWS target account: `266176113726`, region `us-east-1`.
- GitHub-hosted OIDC is proven by run `31381388221`; immutable repository subjects are trusted for the authorized deployment role.
- PR #161 merged as `2e3a3d6b67883156e7cd4991ce0f4b53c3382d4a`; exact-main gate run `31400717610`, attempt 2, passed.
- QuantMail frontend digest `sha256:b0574a82285f567e04d64f460db3933d847c181a0867f5f2ce372dcef78f0281` was deployed to `quant-staging` by SSM command `bd0d69a5-c3c9-432d-98a3-f0d607f2a58a`; newest Ready pod was `quant-quantmail-687bb4dc98-tqlmq`.
- Internal and external `POST /auth/login` invalid-payload probes returned HTTP 400 JSON. The external probe used `https://quantmail.quantrinity.in/auth/login`.
- `quant-staging-eks` is ACTIVE (Kubernetes v1.34, two node groups). `quant-production-eks` remains intentionally uncreated; the staging rollout does not imply production readiness.
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
- Full authenticated QuantMail UI/feature verification beyond the proven login transport.
- Merge, exact-main CI, immutable image build, and reversible rollout for the feature-wiring candidate.
- Terraform plan review and approval; `bootstrap_root_approved` remains false; production EKS intentionally uncreated.
- QuantAI deploy-path drift (#148) and QuantChat refresh-cookie migration (#146).
- Exact production origin validation and application DNS cutover.
- Full repository-wide blocking-green proof and inherited QuantMail frontend debt.
- Editable Figma execution and final visual-system review.

## Immediate next actions

1. Complete the `fix/quantmail-feature-wiring` candidate, run focused tests/typecheck/build, and merge only through required CI.
2. Build immutable frontend/backend images for the merged SHA as required; deploy to `quant-staging` with newest-Ready-pod smoke and automatic rollback.
3. Perform a non-destructive authenticated live UI audit; never persist credentials or claim untested features.
4. Execute M11D work unit 4 when a live shadow-capable environment exists; preserve append-only evidence.
5. Owner: request SES production access (#145) and track the AWS verification support case.
6. Do not apply Terraform, flip approvals, or change DNS until every guard passes.
