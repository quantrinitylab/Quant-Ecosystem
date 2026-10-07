# M18 — Cost & Capacity Testing

## Required tests
- steady-state load
- peak burst
- flash crowd
- sustained growth
- provider outage
- database degradation
- search reindex
- attachment egress spike
- Quanty usage spike
- noisy tenant
- regional failure

## Evidence
Record throughput, p50/p95/p99 latency, errors, resource saturation, queue age, storage growth, egress, AI/search usage, and cost per workload unit.

## Acceptance
A scaling design is accepted only when its bottleneck, scaling trigger, ceiling, degraded mode, and recovery behavior are demonstrated or explicitly marked unvalidated.
