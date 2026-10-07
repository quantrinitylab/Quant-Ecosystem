# M19 — Database High Availability

## Primary
PostgreSQL primary owns transactional writes.

## HA
Use synchronous/asynchronous replicas according to availability and latency requirements. Automatic failover must include fencing to prevent split-brain writes.

## Recovery
Backups are encrypted, versioned, integrity-checked, and restore-tested.

## Connection behavior
Applications use a stable database endpoint/proxy rather than hardcoding individual nodes. Failover-aware connection retry is bounded and idempotency-safe.

## Verification
After failover verify:
- write availability
- replication health
- sequence/constraint integrity
- outbox/event continuity
- search/index reconciliation
- application error rate

A replica is not a backup unless it is independently recoverable.
