# Workstream Status

Status vocabulary: `LANDED`, `ACTIVE-CANONICAL`, `ACTIVE-DRAFT`, `BLOCKED`, `QUEUED`, `SUPERSEDED`, `FROZEN`.

| Workstream | State | Current truth |
| --- | --- | --- |
| Canonical project memory | LANDED | Git-backed authority index, validator, and refreshed 2026-08-07 checkpoints (hardening + evening staging coordination) are present |
| M11D memory canary | ACTIVE-CANONICAL | WU4 remains active in the Execution Queue; representative archived evidence is still required |
| Quant strategy/foundation | LANDED | Genome, laws, model-neutrality, memory architecture, and measurement discipline exist |
| Quantrinity identity | LANDED | Brand architecture and semantic contracts exist; editable visual execution remains incomplete |
| QuantMail UX truthfulness | LANDED | Screen-by-screen honesty work is extensive; audited issues #108–#122 and deployed proof remain |
| Token-family hardening | LANDED | PR #125 merged as `a5f2057887e1842368af4baaf65192c16b5f1c14` |
| Dependency remediation | LANDED | PR #130 merged as `7fe3e25416348477c6790826b43f22ef675b5c0c`; policy remains strict |
| Browser HttpOnly session | LANDED | PR #132 merged as `09a0a22e9aa5fe288d22987b90a6119a70f7c467`; #120 closed with evidence; production-origin and deployment proof remain |
| Cloudflare AI runtime | BLOCKED | PR #135 merged; direct REST runtime is fail-closed and account-level inference is verified (REST 200), but deployed secrets and rollout are absent (#144) |
| Active-account infrastructure | BLOCKED | #131/#133/#134/#137 merged; #140 made the production root single-region safe (closed #129); no Terraform apply occurred |
| Mixed migration PR | SUPERSEDED | PR #126 remains comparison-only; do not merge |
| AWS OIDC/EKS bootstrap | BLOCKED | #127 closed: OIDC provider and `quant-gha-deploy` role exist; AWS account verification blocks `sts:AssumeRoleWithWebIdentity` (support case filed); `quant-staging-eks` ACTIVE v1.34; first image pushed |
| Staging bootstrap | ACTIVE-DRAFT | #139 deploy workflow and #147 hostname fix merged; #143 resolves via one-time helm install; real staging secrets are the critical path |
| Cross-agent coordination | ACTIVE-DRAFT | #138 is the control room; registry: [Trinity], [KIRO-INFRA], [Notion-MigOps], [NVIDIA-OPS] (reserved) |
| Production deployment | BLOCKED | Deploy variable disabled; secrets, staging proof, private endpoint path, rollback, and approvals incomplete |
| Figma execution | BLOCKED | Repository contracts/handoff exist; edit-capable workflow is not verified |
| Broader app expansion | FROZEN | Maintain health; do not displace flagship, trust, deployment, or memory depth |

## Completion rule

A workstream is not complete because configuration merged or focused tests passed. Completion requires the appropriate combination of current-head checks, reviewed merge, authorized deployment, real user-path verification, rollback evidence, and canonical memory updates.

## Ninety-day operating focus

1. Finish M11D WU4/WU5 evidence without enabling `new` memory authority.
2. Complete the staging bootstrap (secrets → helm install → digest rollout → rollback proof) and close #143/#144.
3. Resolve QuantAI deploy-path drift (#148) and the QuantChat cookie migration (#146).
4. Prove QuantMail's login → triage → draft → approval → send loop in staging with rollback and observability.
5. Fix inherited flagship frontend/type/coverage debt before expanding product breadth.

## Non-negotiable boundaries

- No `bootstrap_root_approved` or `ENABLE_QUANTMAIL_PRODUCTION_DEPLOY=true` until prerequisites pass.
- No placeholder secrets, public DNS cutover, or unreviewed Terraform apply.
- Zero Worker scripts is not a defect in the direct Workers AI REST architecture.
- An image push is not a rollout; a staging rollout is not production readiness.
- Unknown EKS state must remain unknown until authorized verification.
