# Shadow Metrics (Agent C, M11c)

> Production dashboards for shadow mode. All observational — metrics NEVER
> influence routing, policy, retrieval, acceptance, or retries (ADR-011).
> Source: `ShadowReport` stream → `aggregateShadowReports` / `evaluateCutoverGates`.

## Metrics

| Metric                  | Definition                                              | Source                              | Cutover target  |
| ----------------------- | ------------------------------------------------------- | ----------------------------------- | --------------- |
| Recall Agreement        | Jaccard of legacy vs new recalled contents (normalized) | `divergence.agreementRate`          | > 99%           |
| Pending Agreement       | share where Pending decisions match                     | new-path state vs legacy (new only) | > 98%           |
| Contradiction Agreement | share where both agree on contradictions/retractions    | divergence semantics                | monitor         |
| Latency Delta           | mean(next.latencyMs − legacy.latencyMs)                 | report latencies                    | < 10% of legacy |
| Divergence Severity     | LOW/MEDIUM/HIGH/CRITICAL distribution                   | `divergence.severity`               | CRITICAL = 0    |
| Backend Errors          | count of new-path errors (swallowed)                    | `next.error` present                | = 0             |
| Shadow Success Rate     | fraction of requests where new completed without error  | 1 − errors/total                    | monitor         |

## Emission

- The facade emits one `ShadowReport` per recall via the injected `onShadow` sink.
- Production wiring: the sink forwards to the metrics pipeline (e.g. Prometheus
  counters/histograms + a divergence log for HIGH/CRITICAL). No sink → no overhead.
- HIGH/CRITICAL divergences additionally emit a reproducible divergence record
  (see ADR-011 constraint 4) for offline replay via `verifyReproducible`.

## Dashboards (suggested panels)

1. Recall agreement over time (target line at 99%).
2. Latency delta (legacy vs new, p50/p95).
3. Severity stacked bar (LOW/MEDIUM/HIGH/CRITICAL) per hour.
4. Backend error rate.
5. Shadow success rate.
6. Open blocking cases (HIGH/CRITICAL requestIds) — must reach 0 before cutover.

## Non-negotiable

A drop in any metric records data and (optionally) alerts a human. It NEVER
auto-changes the mode. Mode changes are human decisions recorded in
MIGRATION_SCOREBOARD.md.
