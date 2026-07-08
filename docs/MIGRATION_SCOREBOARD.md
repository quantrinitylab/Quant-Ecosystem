# Memory Migration Scoreboard

> One row per migration event. **Never delete rows.** History is permanent.
> Populated during M11c shadow runs and each mode transition.
> Gates (ADR-011): semantic agreement > 99%, latency delta < 10%,
> pending agreement > 98%, critical divergences = 0, infra failures = 0.

| Date                                                          | Mode | Semantic Agreement | Pending Agreement | Latency Δ | Critical Divergences | Infra Failures | Rollback Tested | Decision |
| ------------------------------------------------------------- | ---- | ------------------ | ----------------- | --------- | -------------------- | -------------- | --------------- | -------- |
| _(none yet — awaiting first shadow run against live traffic)_ |      |                    |                   |           |                      |                |                 |          |

## How rows are produced

1. Run traffic through `MemoryFacade` in `shadow` mode; collect `ShadowReport`s.
2. `aggregateShadowReports(reports)` → agreement, severity counts, latency Δ, infra errors.
3. `evaluateCutoverGates(agg, legacyAvgLatencyMs)` → pass/fail + reasons.
4. Record one row. A human decides the mode change; the facade never self-migrates.

## Decision values

- `HOLD` — gates not met; stay in current mode.
- `ADVANCE(dual_write→shadow→new)` — gates met; human approves next mode.
- `ROLLBACK(→prev)` — regression observed; revert mode (verified reversible).
