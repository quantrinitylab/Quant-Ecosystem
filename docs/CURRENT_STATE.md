---
doc_id: quant-current-state
doc_type: current-state
authority: canonical
status: active
owner: platform-architecture
last_verified: 2026-08-06
verified_at_commit: 1162352cf094615136098d2675f169e886364e9f
review_by: 2026-09-05
supersedes: []
superseded_by: []
canonical_scope: current-repository-state
---

# Current State

This is the canonical repository-truth snapshot, pinned to the last explicitly reviewed merged-main checkpoint `1162352cf094615136098d2675f169e886364e9f` and supplemented by current open-PR/issue evidence. Newer code and blocking CI evidence take precedence; the [Execution Queue](./EXECUTION_QUEUE.md) separately owns priority.

## Active direction

The canonical active milestone remains **M11D-SHADOW-CANARY**, work unit 4: produce representative, durable, tenant-safe shadow evidence while legacy behavior remains authoritative. Its order and exit gates live only in the Execution Queue.

Recent repository activity is concentrated on dependency remediation, S-01-style authentication hardening, QuantMail browser-session migration, Cloudflare Workers AI, and target-account deployment. This is a visible priority mismatch, not permission to silently replace the active milestone. The owner must either keep/finish/block WU4 or approve and record a queue change.

## Verified truth

| Area                    | Evidence                                                                                                                                                                                                                                                         | Consequence                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Memory V2               | Ports, durable persistence, retrieval, policy, replay, four-mode facade, durable shadow reports, representative WU4 runner, and release boundary exist; see [architecture](./MEMORY_ARCHITECTURE.md) and [ADR-011](./adr/011-memory-facade-shadow-migration.md). | WU4 live evidence remains active; `new` authority stays blocked.                                               |
| Memory cutover          | [Scoreboard](./MIGRATION_SCOREBOARD.md) records 14.3% agreement and five critical divergences; two precision-regressing experiments were reverted in the [decision log](./M11D_DECISION_LOG.md).                                                                 | Decision remains **HOLD**; measurement and Law 7 gates are working.                                            |
| QuantMail design        | Issue #71 and merged PRs #72–#107 plus #123/#124 established Quantrinity identity, semantic design roles, shell/state evolution, truthful settings, and verified shortcut copy.                                                                                  | Foundation is substantial; audited issues #108–#122 and editable Figma work remain.                            |
| Refresh-family security | Open PR #125 persists one-way refresh digests, validates binding, rotates atomically, and revokes reused families; focused security evidence is green.                                                                                                           | Candidate implementation is not merged; dependency/aggregate gates still apply.                                |
| Dependencies            | Draft PR #130 remediates high/critical findings without lowering thresholds; moderate+ audit and CodeQL are green, while main gate and full sweep are red.                                                                                                       | It remains intentionally non-mergeable and blocks stacked PRs.                                                 |
| Browser auth            | Draft PR #132 removes browser refresh JSON/storage, uses an HttpOnly cookie, memory-only access token, bounded retry, exact-origin controls, same-origin proxies, OAuth compatibility, and Chromium acceptance.                                                  | Focused evidence is strong, but dependency/main/typecheck/full-sweep/review/deploy gates remain red or absent. |
| AI provider             | Draft PR #135 isolates a fail-closed Cloudflare Workers AI runtime; focused tests, backend typecheck/lint, several security lanes, and secret scan are green.                                                                                                    | Dependency/aggregate gate and review block merge; no production activation occurred.                           |
| Deployment              | PR #126 is superseded; Issue #127 tracks missing OIDC/EKS/images. Terraform audit found unsafe multi-region, cost, and stale-domain assumptions.                                                                                                                 | No production apply, release image rollout, or application DNS cutover is authorized.                          |
| Realtime                | WebSockets send real frames, but connection/channel/presence state is node-local and JetStream durability is not end-to-end.                                                                                                                                     | Multi-instance failover is not production-proven.                                                              |
| Project memory          | Canonical memory and validator exist; detailed owner/session context is proposed under [`.agents/project-memory`](../.agents/project-memory/README.md).                                                                                                          | Supporting memory must never override code, CI, ADRs, Current State, or Execution Queue.                       |

## Working-tree and PR boundary

Uncommitted, staged, branch-only, or draft-PR code and evidence are candidates—not canonical implementation fact. Before changing a work-unit state, commit coherent implementation and evidence, run required checks, obtain review, merge, and advance `verified_at_commit` to a reviewed ancestor.

## Current release boundary

- Do not enable Memory V2 `new` or change migration policy before ADR-011 evidence and human approval.
- Do not merge PR #130, #125, #132, or #135 while required gates are red or review is absent.
- Do not use superseded PR #126 as a deployment source.
- Do not apply stale Terraform/Helm values, push mutable images, or change application DNS.
- Do not claim production readiness from direct provider inference or focused tests alone.

## Immediate next actions

1. Land the project-memory refresh through a focused reviewed PR.
2. Resolve the canonical queue-versus-recent-work discrepancy with the owner.
3. If security is formally prioritized, reproduce PR #130's exact failing boundary, land it safely, then refresh PRs #125/#132/#135 in dependency order.
4. If M11D remains active, execute WU4 with reviewed real dependencies and archive the required versioned evidence without tuning behavior.
