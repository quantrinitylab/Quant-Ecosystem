# M17 — Database Performance Architecture

PostgreSQL is authoritative for transactional Mail state. Search engines, caches, projections, and analytics never replace transactional truth.

## Query rules
- Every production query has an identified access path.
- Validate hot queries with EXPLAIN ANALYZE and BUFFERS against representative data.
- Do not select message bodies on list paths.
- Batch bounded IDs; prevent ORM N+1 behavior.
- Use keyset pagination, not deep OFFSET.
- Keep transactions short and cancellation-aware.

## Index strategy
Typical candidates include:
- mailbox + received time + id
- mailbox + unread + received time + id
- thread + sent time + id
- mailbox + updated time + id
- unique provider/message identifiers

Indexes must be justified against cardinality and write amplification.

## Connection pools
Separate interactive traffic from workers. Size pools from database capacity, cap aggregate connections across replicas, propagate cancellation, and monitor active/idle/waiting connections and transaction duration.

## Partitioning
Do not partition by default. Introduce partitioning only after measured growth or maintenance pressure justifies it. Candidate dimensions are mailbox/account hash, time, or a hybrid for exceptional stores.

## Read replicas
Replicas may serve explicitly stale-tolerant workloads. Mutation confirmation, authorization-sensitive reads, and post-write verification use authoritative state.

## Migration safety
Use expand → migrate/backfill → verify → contract. Throttle backfills and monitor locks and replication lag.
