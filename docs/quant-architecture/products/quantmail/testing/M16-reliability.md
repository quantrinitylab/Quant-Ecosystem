# M16 — Reliability Testing

## Unit
- health state
- retry policy
- circuit breaker
- queue classification
- SLO calculations
- recovery state

## Integration
- dependency timeout
- queue backlog
- provider outage
- DB failover
- search outage
- object storage outage
- realtime reconnect

## DR
- backup integrity
- restore
- event reconciliation
- controlled cutover
- recovery verification

## Chaos
- injected latency
- dropped connections
- partial dependency failure
- duplicate events
- delayed provider callback
- queue poison message

## Acceptance
A recovery test is incomplete until user-facing state is verified after recovery.
