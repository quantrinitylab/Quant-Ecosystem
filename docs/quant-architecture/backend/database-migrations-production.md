# M19 — Production Database Migrations

## Required pattern
Expand → deploy compatible code → backfill/throttle → verify → contract.

## Rules
- migrations are versioned
- destructive changes require a separately verified phase
- long locks are prohibited on hot tables
- backfills are resumable
- progress is observable
- rollback strategy is documented before production execution

## Safety
Schema compatibility must support the previous and new application versions during rolling/canary deployment.

Data migrations never assume that application rollback automatically reverses data changes.
