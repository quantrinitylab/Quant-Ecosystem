# M21 — Privacy-Preserving Telemetry

## Rules
- no raw message bodies in logs
- no attachment contents in logs
- avoid full search queries where unnecessary
- redact tokens, secrets, addresses, and sensitive identifiers
- use aggregation for product analytics where possible
- separate security telemetry from product analytics

## Retention
Telemetry has independent retention classes and follows M15 lifecycle rules.

## Access
Analyst access is role-scoped and audited. Debug access to private content requires explicit authorization and a documented purpose.
