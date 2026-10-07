# M19 — Production Infrastructure Testing

## Required validation
- rolling deploy
- canary failure
- application rollback
- database migration rollback compatibility
- pod/node/AZ failure
- database failover
- Redis loss
- Kafka broker/consumer failure
- search outage
- object storage degradation
- provider outage
- secret rotation
- restore drill
- regional recovery drill

## Evidence
Capture recovery time, data loss, queue continuity, error rate, user-visible impact, and operator actions.

No HA or DR claim is accepted solely from configuration files; failure behavior must be exercised.
