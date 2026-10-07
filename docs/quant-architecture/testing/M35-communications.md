# M35 Testing — Communications

Test:
- provider adapter contract
- idempotent send
- timeout/UNKNOWN reconciliation
- consent enforcement
- unsubscribe
- suppression
- channel fallback
- template validation
- localization
- digest dedupe
- provider failover
- cost throttling

Invariant: no unauthorized message, no duplicate delivery caused by retry ambiguity, and no suppression bypass without policy.
