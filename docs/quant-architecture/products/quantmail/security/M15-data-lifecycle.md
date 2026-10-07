# M15 — Data Lifecycle Security

## Threats
- unauthorized export
- destructive deletion abuse
- hold bypass
- residual derived data
- expired capability reuse
- cross-tenant lifecycle action
- audit manipulation

## Controls
- scoped authorization
- step-up authentication
- short-lived export/download capabilities
- immutable lifecycle state transitions
- hold checks at execution time
- derived-data invalidation
- deletion verification
- audit trail
- rate limits for expensive exports/deletions

Lifecycle completion is a verified state, not a client assertion.
