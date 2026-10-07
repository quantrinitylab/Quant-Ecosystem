# M22 — Regional Failover

## Failure levels
Service → zone → region → provider.

## Failover sequence
Detect → assess residency eligibility → select approved recovery region → redirect traffic → verify dependencies → reconcile queues/events → verify user state.

## Safety
Do not fail over to a region that violates tenant residency.

## Recovery
Failback is a separate controlled operation. It must not automatically move writes back while reconciliation is incomplete.
