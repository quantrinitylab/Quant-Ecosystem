# M17 — Mailbox Isolation & Noisy-Neighbor Protection

A large or abusive mailbox must not degrade unrelated users.

## Controls
- per-mailbox request concurrency
- per-user CPU/query budgets
- per-organization worker quotas
- workload-specific queue lanes
- large-mailbox isolation lanes
- adaptive rate limits
- bounded search fanout
- attachment bandwidth quotas
- backfill throttling

## Signals
Track rows scanned, query latency, connection wait, queue age, websocket fanout, attachment egress, indexing backlog, and repeated expensive searches.

## Response
Detect pressure → attribute it to mailbox/user/org/workload → shed optional enrichment → throttle/isolate expensive work → preserve core read/send correctness → emit telemetry.

Enterprise quotas may be higher without bypassing platform safety limits.
