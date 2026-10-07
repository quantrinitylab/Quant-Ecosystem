---
doc_id: m11d-durable-shadow-report-2026-07-23
doc_type: evidence-baseline
authority: evidence
status: append-only
owner: platform-architecture
captured_at: 2026-07-23
verified_at_commit: 076922c363285609842434a6a328c3af0d29020c
branch: kiro/m11d-wu3-durable-shadow
milestone_id: M11D-SHADOW-CANARY
work_unit: 3
decision: KEEP
---

# M11d durable shadow report — 2026-07-23

This records work unit 3 at implementation SHA `076922c363285609842434a6a328c3af0d29020c`. It changes canary composition, evidence durability, and CI orchestration only. Legacy output remains authoritative; retrieval behavior, acceptance policy, and `new` authority are unchanged.

## Durable and tenant boundary

- Additive migration `0050_memory_shadow_reports` stores report payloads and commit, policy, corpus, severity, agreement, infrastructure-error, observation, and expiry metadata in PostgreSQL.
- `(tenantId, requestId)` is unique. Repository find, list, count, and delete APIs require tenant scope; no unscoped read/delete method exists.
- Personal tenant scope is derived only from the authenticated actor, never an untrusted request header. Status counts are authenticated and actor-scoped.
- PostgreSQL constraints reject invalid mode, severity, agreement, SHA, metadata, and retention windows.
- Default retention is 30 days; configuration is restricted to 1–90 days and cleanup is tenant-scoped.
- Shadow persistence failures are logged and cannot delay or alter the legacy-authoritative response.

## Acceptance proof

| Check                                                                                                                  | Result                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [Final CI run](https://github.com/quantrinitylabsgo/Quant-Ecosystem/actions/runs/29987010526)                          | Final implementation SHA; required WU3 jobs passed.                                                                                        |
| [Affected-package gate](https://github.com/quantrinitylabsgo/Quant-Ecosystem/actions/runs/29987010526/job/89141026092) | **SUCCESS**; deterministic Prisma generation preceded parallel Turbo tasks.                                                                |
| [PostgreSQL proof](https://github.com/quantrinitylabsgo/Quant-Ecosystem/actions/runs/29987010526/job/89141025997)      | **SUCCESS**; migration, Prisma-client reconstruction durability, cross-tenant isolation, DB constraints, and tenant-scoped cleanup passed. |
| [QuantChat coverage](https://github.com/quantrinitylabsgo/Quant-Ecosystem/actions/runs/29987010526/job/89141025955)    | **SUCCESS**; 829/829 tests, all configured metrics above 50%.                                                                              |
| Local AI facade/replay/repository                                                                                      | **26/26 passed**.                                                                                                                          |
| Local QuantAI facade/sink                                                                                              | **24/24 passed**.                                                                                                                          |
| Local AI package suite                                                                                                 | **541 passed, 4 skipped**.                                                                                                                 |
| Prisma schema and project-memory validation                                                                            | **Passed**; project-memory focused tests 11/11.                                                                                            |
| Changed-file diagnostics                                                                                               | **0 issues**.                                                                                                                              |

A full local gate was not claimed because the isolated checkout exhausted disk space. CI on the final SHA is the authoritative clean-environment proof.

## Migration and rollback

Apply through the repository migration chain; the isolated CI proof executes `prisma db execute --schema=prisma/schema.prisma --file=prisma/migrations/0050_memory_shadow_reports/migration.sql`. Rollback is code rollback plus `DROP TABLE "memory_shadow_reports"` only after evidence retention/export approval; the migration has no relations to existing production rows.

## Remaining boundary

The proof covers application/Prisma-client reconstruction, not guaranteed delivery of an in-flight fire-and-forget report during abrupt process termination. Tenant isolation is enforced by authenticated composition and repository predicates, not PostgreSQL RLS. WU4 must generate versioned representative traffic and replay artifacts before any tuning. Migration decision remains **HOLD**, and `new` authority remains blocked pending all ADR-011 gates and human approval.
