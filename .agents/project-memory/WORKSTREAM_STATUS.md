# Workstream Status

Status vocabulary: `LANDED`, `ACTIVE-CANONICAL`, `ACTIVE-DRAFT`, `BLOCKED`, `QUEUED`, `SUPERSEDED`, `FROZEN`.

| Workstream | State | Current truth |
| --- | --- | --- |
| Canonical project memory | LANDED | Git-backed authority index, validator, and refreshed 2026-08-07 project checkpoint are present |
| M11D memory canary | ACTIVE-CANONICAL | WU4 remains active in the Execution Queue; representative archived evidence is still required |
| Quant strategy/foundation | LANDED | Genome, laws, model-neutrality, memory architecture, and measurement discipline exist |
| Quantrinity identity | LANDED | Brand architecture and semantic contracts exist; editable visual execution remains incomplete |
| QuantMail UX truthfulness | LANDED | Screen-by-screen honesty work is extensive; audited issues #108–#122 and deployed proof remain |
| Token-family hardening | LANDED | PR #125 merged as `a5f2057887e1842368af4baaf65192c16b5f1c14` |
| Dependency remediation | LANDED | PR #130 merged as `7fe3e25416348477c6790826b43f22ef675b5c0c`; policy remains strict |
| Browser HttpOnly session | BLOCKED | PR #132 merged as `09a0a22e9aa5fe288d22987b90a6119a70f7c467`; production-origin and deployment proof remain |
| Cloudflare AI runtime | BLOCKED | PR #135 merged; direct REST runtime is fail-closed, but real production secrets/rollout are absent |
| Active-account infrastructure | BLOCKED | #131/#133/#134/#137 merged; no Terraform apply or deployment occurred |
| Mixed migration PR | SUPERSEDED | PR #126 remains comparison-only; do not merge |
| AWS OIDC/EKS bootstrap | BLOCKED | Issue #127; OIDC role absent, EKS unknown to the read role, repositories contain zero images |
| Production deployment | BLOCKED | Deploy variable disabled; secrets, images, staging, private endpoint path, rollback, and approvals incomplete |
| Figma execution | BLOCKED | Repository contracts/handoff exist; edit-capable workflow is not verified |
| Broader app expansion | FROZEN | Maintain health; do not displace flagship, trust, deployment, or memory depth |

## Completion rule

A workstream is not complete because configuration merged or focused tests passed. Completion requires the appropriate combination of current-head checks, reviewed merge, authorized deployment, real user-path verification, rollback evidence, and canonical memory updates.

## Ninety-day operating focus

1. Finish M11D WU4/WU5 evidence without enabling `new` memory authority.
2. Establish authorized OIDC/EKS read/deploy paths and review the first production-v2 plan.
3. Provision real secrets, immutable images, and an origin-only staging environment.
4. Prove QuantMail's login → triage → draft → approval → send loop with rollback and observability.
5. Fix inherited flagship frontend/type/coverage debt before expanding product breadth.

## Non-negotiable boundaries

- No `bootstrap_root_approved` or `ENABLE_QUANTMAIL_PRODUCTION_DEPLOY=true` until prerequisites pass.
- No placeholder secrets, public DNS cutover, or unreviewed Terraform apply.
- Zero Worker scripts is not a defect in the direct Workers AI REST architecture.
- Unknown EKS state must remain unknown until authorized verification.
