# M22 — Regional Routing

## Request routing
Route users to an approved region using tenant residency, service availability, and latency policy.

## Important
Nearest region is not always correct. Residency and authorization constraints take precedence over latency.

## Session behavior
A session carries region affinity. Failover can move traffic only to an approved recovery region.

## Service discovery
Service endpoints are region-aware. Cross-region calls are explicit and observable.
