# M16 — Reliability, Observability & Disaster Recovery

Status: SPEC_COMPLETE_TARGET
Priority: P0

## Principle

A production feature is incomplete until its health, failure modes, recovery path and operational evidence are defined.

## User-visible reliability states

- operating normally
- degraded
- delayed
- temporarily unavailable
- recovering

Never show fabricated progress during an outage.

## Surfaces

- service health
- delivery health
- sync health
- search freshness
- incident status
- recovery status

## Evidence

- healthy request
- dependency timeout
- queue backlog
- database degradation
- provider outage
- search lag
- realtime disconnect
- restore drill
- failover
