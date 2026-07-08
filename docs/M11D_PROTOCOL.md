# M11 Validation Protocol (M11c Shadow → M11d Live)

> **Charter:** _M11c succeeds when the new memory system can observe real
> production traffic without influencing production behavior._ If this stays true
> throughout implementation, the work stays disciplined.
>
> **Purpose:** Measure the frozen memory subsystem under real workloads. This
> phase exists to understand the system, not to improve it. No prompt, policy, or
> code change to the memory engine is permitted until Baseline v1 is completed,
> archived, and reviewed.

## Version freeze (record BEFORE any baseline run)

Capture all six, immutably, per baseline:

- model ID (extraction + embedding)
- prompt revision
- policy version (`MemoryPolicy.version`)
- dataset/corpus version (`CORPUS_VERSION`)
- application commit SHA
- dependency lockfile hash

## Phases & exit criteria

| Phase            | Goal                                                   | Stop when                                      |
| ---------------- | ------------------------------------------------------ | ---------------------------------------------- |
| Environment      | Docker + Postgres/pgvector + Qdrant + OpenAI reachable | one end-to-end request succeeds                |
| M11c Facade      | facade + LEGACY/DUAL_WRITE/SHADOW/NEW modes            | done-definition (ADR-011) met                  |
| Shadow           | run real/representative traffic in SHADOW              | metrics recorded + archived                    |
| Baseline v1      | run the versioned corpus through the wired path        | metrics recorded + archived; **no tuning**     |
| Failure analysis | classify failures                                      | every failure has exactly one cause (taxonomy) |
| Tuning           | one controlled change                                  | one change + one rerun; never batch            |

## Cutover gates (LEGACY→...→NEW) — prove it, don't eyeball it

All must pass (ADR-011):

- Semantic agreement > 99%
- Latency delta < 10%
- Pending agreement > 98%
- Critical divergences = 0
- Infrastructure failures = 0

One fails → no migration.

## Baseline discipline

- Baseline v1 is **read-only forever**. Improvements create v2, v3, …; originals
  are never overwritten.
- Archive per baseline: version freeze + replay records + evaluation report +
  MIGRATION_SCOREBOARD row.
- Success = trustworthy, reproducible, attributable evidence — regardless of
  whether the numbers are flattering.

## Sequence

`main (#548 merged) → M11c (facade/shadow/metrics) → gates pass → M11d (live
baseline) → M11e (stabilization) → M12 → M13`.
