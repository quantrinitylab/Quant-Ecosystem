---
doc_id: quant-current-state
doc_type: current-state
authority: canonical
status: active
owner: platform-architecture
last_verified: 2026-08-07
verified_at_commit: 09a0a22e9aa5fe288d22987b90a6119a70f7c467
review_by: 2026-09-06
supersedes: []
superseded_by: []
canonical_scope: current-repository-state
---

# Current State

This is the canonical repository-truth snapshot pinned to merged `main` commit `09a0a22e9aa5fe288d22987b90a6119a70f7c467`. Newer code and blocking CI evidence take precedence until this file is re-verified; the [Execution Queue](./EXECUTION_QUEUE.md) separately owns priority.

## Active direction

The one canonical active milestone remains **M11D-SHADOW-CANARY**, work unit 4: produce representative, durable, tenant-safe replay evidence for Memory V2 shadow mode while legacy behavior remains authoritative. Recent security, provider, and deployment hardening is a merged parallel workstream; it did not silently replace the queue.

The product strategy is depth over breadth: prove QuantMail, QuantChat, and QuantAI as trustworthy flagship surfaces over an indispensable abstraction layer—model-agnostic orchestration, OAuth2/SSO, credits, user-owned memory, trusted cross-app execution, and evaluation—before expanding the broader app portfolio.

## Verified truth

| Area | Evidence | Consequence |
| --- | --- | --- |
| Memory V2 | Ports, persistence, retrieval, policy, replay, four modes, WU2/WU3 durable evidence, and the WU4 runner exist; see [architecture](./MEMORY_ARCHITECTURE.md) and [ADR-011](./adr/011-memory-facade-shadow-migration.md). | WU4 is still active. `legacy` remains authoritative and `new` remains blocked. |
| Core AI | [`AIEngine`](../packages/ai/src/core/engine.ts) constructs its memory facade in hardcoded `legacy` mode. | Memory V2 is not universal inference authority. |
| Cutover | The [Migration Scoreboard](./MIGRATION_SCOREBOARD.md) still records 14.3% agreement and five critical divergences. | Decision remains **HOLD**; no automatic promotion. |
| Experiments | The [Decision Log](./M11D_DECISION_LOG.md) records two precision regressions that were reverted. | Measure-first and Law 7 gates are working. |
| Realtime | WebSockets send real frames, but connection/channel/presence state is node-local and JetStream durability is not end-to-end. | Multi-instance failover remains unproven. |
| Authentication | PR #125 merged as `a5f2057887e1842368af4baaf65192c16b5f1c14`; PR #132 merged as `09a0a22e9aa5fe288d22987b90a6119a70f7c467`. | Refresh families rotate atomically with reuse revocation; browser refresh credentials are HttpOnly, exact-Origin guarded, host-only, and absent from JSON/storage. Non-browser OAuth remains compatible. |
| Dependency/supply chain | PR #130 merged as `7fe3e25416348477c6790826b43f22ef675b5c0c`, including the post-publication `js-yaml` 4.3.1 remediation. | High/critical policy remains enforced without advisory suppression or threshold reduction. |
| AWS configuration | PRs #131, #133, #134, and #137 merged fail-closed roots/profiles and replaced legacy account `650708167640` with `266176113726` in active deployment references. | Merged configuration is safer, but merge is not an apply or deployment. |
| AWS live state | The active read identity is in account `266176113726`; five immutable, scan-on-push ECR repositories exist and contain zero images. The GitHub OIDC deploy role and required production secret paths are absent. EKS could not be verified because the read role lacks `DescribeCluster`. | Production bootstrap remains blocked. Unknown EKS state must not be described as absent or ready. |
| Cloudflare | `quantrinity.in` and `quantmail.in` are active zones. PR #135 merged as `8aa8fa5d911ec306229a03bb9cad9a6124ea1c7b` with a fail-closed direct Workers AI REST client for `@cf/meta/llama-3.2-1b-instruct`; zero Worker scripts are deployed, as expected for this architecture. | Runtime code exists, but production credentials, origin validation, rollout, and monitoring remain incomplete. |
| CI | The definitive PR #132 head passed gate, dependency audit, memory/PostgreSQL, QuantChat coverage, immutable action pins, all three CodeQL analyses, backend typecheck, focused auth typecheck, focused contracts, and real Chromium acceptance. | Required integration evidence passed. The informational repository-wide full sweep was still running at merge and remains distinct from hard-gate proof. |
| Frontend debt | Base and current full QuantMail frontend typechecks had identical annotations for missing `@quant/agentic/voice-commands` types and three implicit-`any` parameters; the changed browser-auth boundary passed. | Inherited debt remains visible and must be fixed separately; it was not hidden or misclassified as a #132 regression. |
| Deployment/cutover | No Terraform apply, image push, production deployment, placeholder-secret write, or application DNS cutover occurred in this hardening sequence. `ENABLE_QUANTMAIL_PRODUCTION_DEPLOY` remains disabled. | The repository is materially safer but is not production-proven. |
| Legacy guidance | The [production prompt](../.kiro/steering/PRODUCTION_READINESS_PROMPT.md) contains historical bootstrap guidance. | It remains manual, non-authoritative, and must not auto-execute. |

## Merged hardening baseline

- #125 `a5f2057887e1842368af4baaf65192c16b5f1c14` — refresh-token family integrity.
- #130 `7fe3e25416348477c6790826b43f22ef675b5c0c` — dependency remediation.
- #137 `cf1797c510a5bff349220c8f0e680ca4536997ee` — legacy AWS account replacement.
- #131 `a05bcfc4249a0fc392418ee053e9a5799ad40cde` — unsafe legacy production Terraform root locked.
- #133 `04b9b0c845a1f32598bf2e8e70cdb5b89a9708c3` — fail-closed single-region production v2 root.
- #134 `42133d98d73e31b4c70ca62c583ec64b7018a419` — fail-closed production v2 Helm profile.
- #135 `8aa8fa5d911ec306229a03bb9cad9a6124ea1c7b` — fail-closed Workers AI runtime.
- #132 `09a0a22e9aa5fe288d22987b90a6119a70f7c467` — HttpOnly browser refresh session.

## Working-tree boundary

Uncommitted, staged, draft, or merely reviewed code and agent reports are candidate evidence, not canonical fact. Advance `verified_at_commit` only after the coherent implementation and evidence are merged.

## Current release boundary

Do not set `bootstrap_root_approved`, enable `ENABLE_QUANTMAIL_PRODUCTION_DEPLOY`, apply Terraform, push images, write placeholder secrets, or change application DNS until authorized OIDC/EKS access, real secrets, immutable images, origin-only staging health, rollback, security, load, cost, and owner approvals are evidenced.

## Immediate next action

Execute work unit 4 in the [Execution Queue](./EXECUTION_QUEUE.md). In parallel, administrators may satisfy external production prerequisites without changing the canonical milestone: deploy the reviewed OIDC template, verify supported EKS state/version, provision real secrets through an authorized path, and review a Terraform plan before any apply.
