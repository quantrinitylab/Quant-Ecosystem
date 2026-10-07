# M16 — Disaster Recovery

## RPO

Define maximum acceptable data loss separately for:
- Mail metadata
- message bodies
- attachments
- delivery state
- audit
- search indexes
- derived embeddings

Derived indexes may be rebuilt from source truth where practical.

## RTO

Define recovery targets per critical journey rather than one number for the entire product.

## DR modes

- dependency failover
- service restart
- regional recovery
- database restore
- object recovery
- event replay

Every mode has an owner and runbook.
