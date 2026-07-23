---
doc_id: quant-current-state
doc_type: current-state
authority: canonical
status: active
owner: platform-architecture
last_verified: 2026-07-23
verified_at_commit: 076922c363285609842434a6a328c3af0d29020c
review_by: 2026-08-06
supersedes: []
superseded_by: []
canonical_scope: current-repository-state
---

# Current State

This is the canonical repository-truth snapshot, pinned to commit `076922c363285609842434a6a328c3af0d29020c`. Newer code and blocking CI evidence take precedence until this file is re-verified; the [Execution Queue](./EXECUTION_QUEUE.md) separately owns priority.

## Active direction

The active milestone is **M11D-SHADOW-CANARY**: produce durable, tenant-safe, release-gated evidence for Memory V2 shadow mode while legacy behavior remains authoritative. Its ordered units and exit gates live only in the Execution Queue. Identity hardening remains queued as **S-01** and must not displace it.

## Verified truth

| Area            | Evidence                                                                                                                                                                                                                                                                               | Consequence                                                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Memory V2       | Ports, Prisma persistence, retrieval, policy, replay, and a four-mode facade exist; see [architecture](./MEMORY_ARCHITECTURE.md) and [ADR-011](./adr/011-memory-facade-shadow-migration.md).                                                                                           | Architecture exists; production activation is unproven.                                                                       |
| Core AI         | [`AIEngine`](../packages/ai/src/core/engine.ts) constructs its facade in hardcoded `legacy` mode.                                                                                                                                                                                      | Memory V2 is not universal inference authority.                                                                               |
| QuantAI canary  | [WU2 fail-closed evidence](./baselines/m11d-fail-closed-contract-2026-07-22.md) and [WU3 durable report evidence](./baselines/m11d-durable-shadow-report-2026-07-23.md) prove durable dependency gating, PostgreSQL report persistence, client-restart survival, and tenant isolation. | `shadow` can run only with real DB/vector/report dependencies; legacy output remains authoritative and `new` remains blocked. |
| Cutover         | [Scoreboard](./MIGRATION_SCOREBOARD.md) records 14.3% agreement and five critical divergences.                                                                                                                                                                                         | Decision remains **HOLD**; no automatic promotion.                                                                            |
| Experiments     | [Decision Log](./M11D_DECISION_LOG.md) records two precision regressions that were reverted.                                                                                                                                                                                           | Measure-first and Law 7 gates are working.                                                                                    |
| Realtime        | WebSockets send real frames, but connection/channel/presence state is node-local and JetStream durability is not end-to-end.                                                                                                                                                           | Multi-instance failover is not production-proven.                                                                             |
| Auth            | Argon2id, JOSE, PKCE, and secure randomness exist; refresh rotation and RS256 key lifecycle still have durability/transaction gaps.                                                                                                                                                    | Security foundation is real but incomplete.                                                                                   |
| CI              | [Final WU3 CI](https://github.com/quantrinitylabsgo/Quant-Ecosystem/actions/runs/29987010526) passed affected-package, PostgreSQL shadow, and QuantChat coverage gates; full sweep remains informational.                                                                              | WU3 has clean-environment proof; whole-repository health is not yet a blocking proof.                                         |
| Deployment      | Production deployment is not proven to depend on successful CI, and deployment configuration contains stale assumptions.                                                                                                                                                               | A push to `main` is not sufficient release evidence.                                                                          |
| Legacy guidance | The [production prompt](../.kiro/steering/PRODUCTION_READINESS_PROMPT.md) contains stale bootstrap findings.                                                                                                                                                                           | It is manual historical guidance, not current authority.                                                                      |

## Working-tree boundary

Uncommitted or merely staged code, tests, migrations, baselines, and agent reports are **candidate evidence**, not canonical fact. Before changing a work-unit state, commit its coherent implementation and evidence, run the required checks, then advance `verified_at_commit` to the reviewed commit. This prevents a dirty worktree from masquerading as durable Git memory.

## Current release boundary

Do not enable Memory V2 `new` mode or claim production readiness until ADR-011 gates have durable evidence. Do not tune retrieval before the canary baseline. Every behavior change uses one variable, an identical corpus, and an append-only Keep/Revert decision.

## Immediate next action

Execute work unit 4 in the [Execution Queue](./EXECUTION_QUEUE.md): exercise representative QuantAI shadow traffic against a versioned corpus and persist divergence replay artifacts without changing retrieval behavior or acceptance policy.
