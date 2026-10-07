# M32 Testing — Data Platform

Test:
- schema compatibility
- duplicate event handling
- late events
- replay/backfill
- data-quality failures
- lineage completeness
- deletion propagation
- residency filtering
- feature consistency
- analytical authorization

Invariants:
no analytical dataset becomes transactional truth, no unauthorized raw data exposure, and no derived dataset silently outlives declared source policy.
