# M17 — Performance & Scale Testing

## Required workloads
- representative mailbox sizes
- unread-heavy inboxes
- long threads
- attachment-heavy threads
- deep history
- concurrent mutations
- connection saturation
- lexical/semantic/hybrid search
- permission-heavy organizations
- reindex + interactive search
- realtime fanout and reconnect storms
- slow clients and buffer pressure
- queue bursts, retries, downstream outages, poison messages
- hot-tenant load

## Scale tiers
Run baseline, load, stress, and soak tests for S, M, L, and XL mailbox profiles.

## Evidence
Capture dataset shape, concurrency, request mix, p50/p95/p99, errors, DB CPU/IO, pool saturation, queue age, cache hit ratio, search latency, realtime latency, and resource cost.

No scale-ready claim is accepted from synthetic request counts alone.
