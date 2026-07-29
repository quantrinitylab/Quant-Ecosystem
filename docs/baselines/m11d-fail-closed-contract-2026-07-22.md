---
doc_id: m11d-fail-closed-contract-2026-07-22
doc_type: evidence-baseline
authority: evidence
status: append-only
owner: platform-architecture
captured_at: 2026-07-22
verified_at_commit: 0d8c00de4fa5cf7beef16b3b74b699021bc40a45
branch: kiro/m11d-wu2-fail-closed
milestone_id: M11D-SHADOW-CANARY
work_unit: 2
decision: KEEP
---

# M11d fail-closed dependency contract — 2026-07-22

This evidence records the work unit 2 configuration-safety change. It changes startup validation and composition only; legacy memory behavior, retrieval scoring, extraction, acceptance policy, and cutover authority are unchanged.

## Contract

| Mode         | Durable database | Durable vector composition | Durable shadow report sink | Startup result when absent                    |
| ------------ | ---------------- | -------------------------- | -------------------------- | --------------------------------------------- |
| `legacy`     | Not required     | Not required               | Not required               | Starts with the existing legacy backend only. |
| `dual_write` | Required         | Required                   | Not required               | Structured startup failure.                   |
| `shadow`     | Required         | Required                   | Required                   | Structured startup failure.                   |
| `new`        | Required         | Required                   | Not required               | Structured startup failure.                   |

An absent `QUANTAI_MEMORY_MODE` still selects `legacy`. An invalid explicit value now throws `QuantaiMemoryConfigurationError` with code `MEMORY_CANARY_CONFIGURATION_INVALID`; it no longer silently falls back.

## Implementation evidence

- `apps/quantai/backend/services/memory-facade.service.ts`
  - defines explicitly tagged durable dependency contracts;
  - validates all non-legacy modes before constructing new memory;
  - does not construct the new-memory graph at all in legacy mode;
  - contains no production in-memory DB fallback;
  - keeps the process-local report array diagnostic-only, never evidence authority.
- `apps/quantai/backend/routes/memory.ts`
  - passes a real Prisma client only when the runtime decorates one;
  - supplies no fake vector or report sink;
  - therefore explicit non-legacy modes fail route registration until later work units wire real dependencies.
- `apps/quantai/backend/__tests__/memory-facade.service.test.ts`
  - adds invalid-mode and missing-dependency contract cases;
  - retains legacy, dual-write, shadow, and reversible-cycle behavior coverage.

## Validation evidence

A temporary directory junction exposed the already-installed original-workspace QuantAI dependencies to the isolated latest checkout; it was removed immediately after each run and did not alter Git state. Tests imported the latest in-repository memory DB helper directly, so the changed contract did not rely on the stale installed `@quant/ai` export surface.

| Check                                                  | Result                                                                                                                                                                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused QuantAI facade suite                           | **15/15 passed** after formatting                                                                                                                                                                                                                 |
| New fail-closed and release-gate cases                 | **9/9 passed**: absent default, invalid mode, canary parsing, blocked `new`, missing dependencies, exact shadow missing set, and sink requirement                                                                                                 |
| Legacy/routing/reversibility cases                     | **6/6 passed**                                                                                                                                                                                                                                    |
| IDE TypeScript diagnostics on service, route, and test | **0 issues**                                                                                                                                                                                                                                      |
| Full package typecheck                                 | Attempted but not claimed: the isolated checkout lacks a complete dependency graph, and the borrowed install exposes unrelated pre-existing package/module-resolution errors. The changed files have zero IDE diagnostics and focused tests pass. |

## Safety and rollback

- Rollback is a three-file revert; no schema or data migration is involved.
- Default/absent mode remains legacy and passed its original behavior tests.
- The change cannot activate `new` authority: the current route root intentionally provides neither vector composition nor a durable report sink.
- No secret, external API, PostgreSQL mutation, Qdrant mutation, or baseline-tuning run occurred.

## Remaining boundary

Work unit 3 must implement a tenant-scoped durable `ShadowReport` schema and sink, then wire real vector composition. Until that exists, `shadow` is intentionally unavailable rather than deceptively in-memory. Migration decision remains **HOLD**.
