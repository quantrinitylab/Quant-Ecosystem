# M17 — QuantMail Performance & Scale

## Goal
Define production performance architecture from a single mailbox through very large mailbox fleets.

## Performance laws
1. Never trade correctness for latency.
2. Databases remain authoritative; caches and indexes are disposable.
3. Every hot path has bounded work, explicit pagination, and measurable budgets.
4. No request performs unbounded fan-out.
5. Large mailboxes cannot become noisy neighbors.
6. User-visible success requires verified state, not enqueue acceptance.

## Critical journeys
| Journey | Budget | Controls |
|---|---:|---|
| Inbox first page | p95 < 300ms | covering indexes, bounded projection, cache |
| Thread open | p95 < 350ms | thread/message indexes, body split |
| Search | p95 < 500ms | lexical/vector indexes, auth filter |
| Compose autosave | p95 < 250ms | idempotent write |
| Send prepare | p95 < 300ms | bounded validation |
| Send acceptance | p95 < 500ms | queue + provider isolation |
| Realtime event | p95 < 1s | gateway fanout + coalescing |

Targets are engineering budgets; measured production baselines determine final SLOs.

## Guardrails
Cursor pagination, bounded ID lists, request deadlines, per-user/org concurrency limits, and load shedding for optional enrichment are mandatory on hot paths.
