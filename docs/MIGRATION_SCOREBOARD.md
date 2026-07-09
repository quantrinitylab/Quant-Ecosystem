# Memory Migration Scoreboard

> One row per migration event. **Never delete rows.** History is permanent.
> Populated during M11c shadow runs and each mode transition.
> Gates (ADR-011): semantic agreement > 99%, latency delta < 10%,
> pending agreement > 98%, critical divergences = 0, infra failures = 0.

| Date                                                                                                                        | Mode   | Semantic Agreement   | Pending Agreement | Latency Δ         | Critical Divergences | Infra Failures | Rollback Tested              | Decision                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------- | ----------------- | ----------------- | -------------------- | -------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-08 (M11c Phase 1: AIEngine wired via facade)                                                                        | legacy | n/a (byte-identical) | n/a               | ~0 (2 async hops) | 0                    | 0              | yes (revert to direct calls) | ADVANCE(→ dual_write in M11d)                                                                                                                                                                                                                                                   |
| 2026-07-09 (QuantAI facade, in-process representative shadow run — `quantai-shadow-evidence-2026-07-09T18-25-11-881Z.json`) | shadow | **14.3%**            | n/a               | +0.02 ms          | **5**                | 0              | yes (#17 mode-cycle test)    | **HOLD** — gates correctly block: legacy (substring over explicit memories) and new (extraction-based) have different semantics by design; cutover requires either seeding parity or acceptance of the new semantics via a reviewed decision. Pipeline proven able to say "no". |
| _(next: deployed-traffic shadow run after QUANTAI_MEMORY_MODE=shadow in a real environment)_                                |        |                      |                   |                   |                      |                |                              |                                                                                                                                                                                                                                                                                 |

## How rows are produced

1. Run traffic through `MemoryFacade` in `shadow` mode; collect `ShadowReport`s.
2. `aggregateShadowReports(reports)` → agreement, severity counts, latency Δ, infra errors.
3. `evaluateCutoverGates(agg, legacyAvgLatencyMs)` → pass/fail + reasons.
4. Record one row. A human decides the mode change; the facade never self-migrates.

## Decision values

- `HOLD` — gates not met; stay in current mode.
- `ADVANCE(dual_write→shadow→new)` — gates met; human approves next mode.
- `ROLLBACK(→prev)` — regression observed; revert mode (verified reversible).
