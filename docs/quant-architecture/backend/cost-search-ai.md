# M18 — Search & Quanty Cost Architecture

## Search
Separate interactive search from indexing/reindexing cost. Measure CPU, memory, storage, vector index footprint, query volume, candidate count, and refresh frequency.

## Quanty
Track model/tool usage by capability, tenant, product, latency tier, and execution outcome.

Quanty budgets must be policy-controlled. A model being cheap does not authorize unlimited calls; a model being expensive does not justify silently degrading correctness.

## Controls
- request budgets
- concurrency limits
- result/token budgets
- cache where semantically safe
- model routing by task class
- batch/background execution for non-urgent work
- per-tenant quotas and anomaly detection

No billing meter should count an unverified outcome as successful work.
