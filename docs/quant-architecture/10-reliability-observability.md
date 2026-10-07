# 10 — Reliability and Observability

Every request propagates trace id, correlation id, tenant id, service name and version.

Metrics:
- product: activation, retention, errors, conversion
- infrastructure: saturation, latency, error rate, queue depth
- AI: TTFT, latency, tokens, credits, provider errors, tool failures, quality
- data: consumer lag, projection lag, index freshness
- economy: reserve/settlement failures and reconciliation
- safety: reports, blocks, false positives and appeals

Every critical service defines availability, latency, durability, recovery target, alert threshold and error budget.

Remote calls use timeout, bounded retry, backoff, idempotency and circuit breaking where appropriate.

Incident lifecycle: detect → triage → contain → communicate → recover → verify → postmortem → prevention.

Release safety: feature flags, canary, rollback, migration safety and health gates.