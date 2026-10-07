# M18 — Storage & Bandwidth Economics

## Storage layers
1. PostgreSQL transactional metadata/content that requires database semantics.
2. Object storage for large attachments and immutable objects.
3. Search/vector projections as rebuildable derived state.
4. Backup/archive storage with independent retention.

## Bandwidth
Separate ingress, origin egress, CDN egress, inter-region traffic, provider traffic, and application transfer.

## Rules
- Large objects never transit application memory unnecessarily.
- Prefer direct/capability-based object transfer.
- Cache eligible immutable objects at the edge.
- Track hot-object and hot-tenant bandwidth.
- Lifecycle cold data according to retention policy.

## Capacity signals
Stored GB, growth/day, egress GB/day, cache hit ratio, object count, average object size, and replication/backup multiplier.
