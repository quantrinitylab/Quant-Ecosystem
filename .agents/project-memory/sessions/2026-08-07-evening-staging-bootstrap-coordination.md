# Session Checkpoint — Evening Staging Bootstrap and Cross-Agent Coordination

**Date:** 2026-08-07 (evening)  
**Repository checkpoint:** `82a0af5d4311f048179a16c33de6b6e17e35c6ac`  
**Classification:** project-only, non-authoritative supporting memory

## Scope

Records the evening staging-bootstrap sequence, the first live cloud artifact, and the cross-agent coordination protocol established in issue #138. No secrets, personal data, or raw conversation transcripts.

## Cross-agent registry

Issue #138 is the shared control room. Permanent tags:

- `[KIRO-INFRA]` — Kiro IDE session: AWS infra, Docker builds, EKS, deployment.
- `[Trinity]` — repo-memory and canonical coordination session (merge bookkeeping, tracker, contradiction cleanup).
- `[Notion-MigOps]` — migration-ops session: live verification, deploy-path audits, owner-facing tracker.
- `[NVIDIA-OPS]` — reserved for the QuantAI release-path audit; no posts yet.

Every claim in #138 must carry evidence (commit SHA, PR, issue, workflow, or live verification) and must distinguish merged configuration, live cloud state, and hypothesis.

## Evening merges

| PR | Main SHA | Outcome |
| --- | --- | --- |
| #139 | `05d9af59b10c33a1d1534273c38775500b756dc0` | Protected staging deployment workflow (OIDC, exact-SHA gate, digest rollout, auto-rollback) |
| #140 | `b724c09e62cca905afc98db6a0283dc6389cbf04` | Single-region-safe production Terraform; closes #129 |
| #141 | `f90a4505c9235ee5d45a2b55e55d0917e1dbc714` | OIDC test workflow |
| #142 | `8b254c1947543559a52ce74f661467cc69b2679f` | QuantMail Dockerfile patches/ fix |
| #147 | `82a0af5d4311f048179a16c33de6b6e17e35c6ac` | Staging hostname drift fixed to `staging.quantrinity.in` |

## First live cloud artifact

- `quant-quantmail` image pushed to ECR at 2026-08-07T14:37:06Z through the EC2 instance-role path.
- Digest `sha256:bf36e8004d914af5594827fd2a23a86a50fd7fccc9cae66e98d62efdb70db575`, tagged with the exact main SHA `8b254c1947543559a52ce74f661467cc69b2679f`, 593 MB.
- Independently verified by two separate read paths. This is an image push only — no rollout and no deployment claim.

## Reconciled AWS truth

- GitHub OIDC provider and the `quant-gha-deploy` role exist (verified by the write-capable session; role created 2026-07-26). The failed `quant-github-oidc-deploy` CloudFormation stack was deleted earlier.
- The current deployment blocker is AWS account verification, which denies `sts:AssumeRoleWithWebIdentity` account-wide; Bedrock and CloudShell are blocked by the same cause. A support case is filed. The temporary path is direct build/push/deploy from the EC2 instance role, documented as temporary.
- `quant-staging-eks` is ACTIVE (Kubernetes v1.34, two node groups, endpoint public+private, control-plane logging enabled). `quant-production-eks` is intentionally not created (staging-first).
- Secrets Manager still holds only `quant/staging/redis/credentials`; real staging secret material is the critical path to starting the pushed image.

## Staging bootstrap order (decided in #138/#143)

1. Provision real staging secrets through the authorized write path — no placeholders, no committed Secret YAML.
2. Confirm the External Secrets operator and `aws-secrets-manager` ClusterSecretStore on `quant-staging-eks`.
3. One-time `helm install` of `infra/helm/quant-platform` with `values-staging.yaml` into `quant-staging`; the release must yield `quant-platform-staging-*` workload names for `deploy-staging.yml` compatibility.
4. Manual digest-pinned rollout with captured previous image and rollback on failed rollout status, until OIDC unblocks.

## Issue hygiene

- #120 closed as completed with a requirement-to-evidence map (#125 + #132).
- #146 filed: QuantChat browser refresh credential migration (staged after the QuantMail pattern).
- #148 filed: QuantAI deploy-path drift (port 3004 vs 3020; `quant-quantai-backend:latest` vs the five release repos). Not a QuantMail staging blocker; required before the first QuantAI rollout.
- #143 resolves through the helm bootstrap once [KIRO-INFRA] confirms.
- #144 account-level Workers AI inference verified (REST 200, 25 tokens); deployed end-to-end remains blocked on secrets and a running backend.
- #145 SES production access is an owner console step.

## Bookkeeping

- #132 informational full sweep `92814996419` passed post-merge.
- #136 informational full sweep `92819176851` passed post-merge at 2026-08-07T09:14:50Z.
- #147 informational full sweep `92910414868` was still running at the time of writing.

## Boundaries

- M11D-SHADOW-CANARY work unit 4 remains the one canonical active milestone; staging becomes its eventual evidence environment.
- No Terraform apply, no placeholder secrets, no mutable `latest`, no production deployment, no application DNS cutover.
