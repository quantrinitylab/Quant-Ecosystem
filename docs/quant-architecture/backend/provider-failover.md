# Provider Failover

## Principle
Failover must never create duplicate financial effects.

## Rules
- Provider is pinned per transaction once financial action begins.
- A timeout is reconciled before any alternate-provider action.
- New checkout attempts may use another healthy provider if policy permits.
- Existing UNKNOWN transactions remain pinned until resolved.
- Provider health is based on measured error rate, latency, reconciliation lag, and webhook health.

Failover decisions are policy-controlled and observable.
