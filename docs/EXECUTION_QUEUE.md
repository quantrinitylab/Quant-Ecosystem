---
doc_id: quant-execution-queue
doc_type: execution-queue
authority: canonical
status: active
owner: platform-architecture
last_verified: 2026-07-23
verified_at_commit: 0d8c00de4fa5cf7beef16b3b74b699021bc40a45
review_by: 2026-08-06
supersedes: []
superseded_by: []
canonical_scope: execution-priority
execution_status: active
milestone_id: M11D-SHADOW-CANARY
---

# Execution Queue

This is the only canonical ordered work queue. Exactly one milestone may have `execution_status: active`; agents must finish or explicitly block its next evidence-producing unit before starting backlog work.

## Active — M11D-SHADOW-CANARY

**Outcome:** make Memory V2 shadow mode deployable, durable, tenant-safe, and release-gated while legacy memory remains authoritative.

**Decision boundary:** this milestone may improve wiring, durability, observability, and proof. It must not tune retrieval behavior, change acceptance policy, or enable `new` authority.

### Ordered work units

| Order | Unit                                                          | State  | Required evidence                                                                                                                      |
| ----- | ------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Capture current canary wiring and failure-mode baseline       | done   | [2026-07-22 baseline](./baselines/m11d-shadow-canary-wiring-baseline-2026-07-22.md): inventory, failure matrix, command outcomes, HOLD |
| 2     | Fail closed for non-legacy modes without durable dependencies | done   | [Fail-closed contract](./baselines/m11d-fail-closed-contract-2026-07-22.md): structured errors and 15/15 focused tests                 |
| 3     | Persist tenant-scoped shadow reports across restart           | active | Blocking PostgreSQL integration proof for restart durability and cross-tenant isolation                                                |
| 4     | Exercise representative QuantAI shadow traffic                | queued | Versioned report artifact and divergence replay records                                                                                |
| 5     | Prove rollback and release gate                               | queued | Mode-cycle test plus blocking CI/deploy check                                                                                          |
| 6     | Update migration decision                                     | queued | Append-only scoreboard row: HOLD, ADVANCE, or ROLLBACK                                                                                 |

A later work unit may exist as uncommitted candidate code, but it cannot skip this order or advance state. Promote a unit only when its coherent implementation and evidence are tracked together and required checks pass.

### Exit gates

All [ADR-011](./adr/011-memory-facade-shadow-migration.md) gates must be evidenced: semantic agreement >99%, pending agreement >98%, latency delta <10%, zero critical divergences, zero infrastructure failures, restart survival, tenant isolation, and demonstrated rollback. Until then the [Migration Scoreboard](./MIGRATION_SCOREBOARD.md) decision remains **HOLD**.

### Operating evidence

Use the existing [M11d protocol](./M11D_PROTOCOL.md), [runbook](./M11D_RUNBOOK.md), [shadow deployment runbook](./SHADOW_DEPLOY_RUNBOOK.md), and [decision log](./M11D_DECISION_LOG.md). Record one behavioral variable per experiment; never rewrite prior rows.

## Ordered backlog

1. **M11E-STABILIZATION** — fix defects exposed by the canary; no new capability.
2. **M12-RETRIEVAL-QUALITY** — semantic retrieval/reranking measured with MRR, Recall@k, and nDCG.
3. **M13-HUMAN-FEEDBACK** — confirmation, rejection, correction, recalibration, and explainability.
4. **S-01-IDENTITY-REVOCATION** — transaction-safe refresh rotation, durable key lifecycle, and session revocation; queued by CEO Order #0029 and not allowed to displace M11d.
5. **RELEASE-GOVERNANCE** — make full-repository health and successful CI prerequisites for production deployment.

## Update rule

Change this queue only with linked evidence. If blocked by credentials or infrastructure, record the blocker and continue with the next work unit inside the active milestone that can produce evidence; do not silently promote backlog work.
