# M28 Testing — Cross-Product Economy

## Contract tests
Every product validates its economy manifest and entitlement/meter contracts.

## End-to-end
- free allowance → exhaustion → configured action
- quote → reservation → successful spend
- quote → reservation → product failure → release
- duplicate usage event
- stale pricing reference
- plan change during active operation
- refund/reversal
- organization billing scope
- sandbox isolation

## Invariants
No product can mint credits, bypass entitlement, create an authoritative billable event without idempotency, or silently change paid behavior.
