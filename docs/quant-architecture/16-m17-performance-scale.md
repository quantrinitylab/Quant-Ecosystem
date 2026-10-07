# M17 — QuantMail Performance & Scale Architecture

## Deliverables
1. Database access-path and connection-pool rules.
2. Cache consistency and stampede controls.
3. Mailbox/noisy-neighbor isolation.
4. Queue throughput and backpressure.
5. Search scaling and reindex safety.
6. WebSocket fanout and reconnect recovery.
7. Attachment bandwidth isolation.
8. Performance/load/soak evidence model.

## Definition of done
- Every critical journey has a measurable latency budget.
- Hot-path queries have validated access paths.
- Large mailboxes have explicit isolation behavior.
- Queue consumers are idempotent and backpressure-aware.
- Realtime is recoverable from source truth.
- Large objects bypass application-memory buffering.
- Search reindex cannot starve interactive traffic.
- Performance tests capture system and dependency saturation.
- Production-readiness claims require measured evidence.
