# Usage Metering

## Pipeline
Product event → authenticated ingestion → schema validation → dedupe → immutable usage record → aggregation → charge/entitlement evaluation → ledger/invoice effect → reconciliation.

## Meter design
A meter has a stable key, unit, product owner, aggregation function, pricing reference, effective date, and version.

Examples:
- AI tokens
- AI generations
- storage bytes-month
- video processing minutes
- outbound bandwidth
- premium actions
- ad impressions

## Guarantees
- Meter keys are versioned; pricing changes never rewrite historical usage.
- Late events use occurredAt and ingestionAt separately.
- Duplicate events are ignored by idempotency identity.
- Corrections are compensating usage records.
- Usage and billing are reconcilable from immutable records.
- Product clients never calculate billable totals as authoritative values.
