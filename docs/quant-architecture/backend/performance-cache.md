# M17 — Cache Architecture

## Cacheable
Slow-changing metadata, safe preference projections, bounded inbox summaries with reliable invalidation, configuration, and explicitly TTL-bound derived context.

## Never authoritative
Caches cannot decide authorization, send state, delivery state, mailbox ownership, retention/deletion, or security policy.

## Invalidation
Prefer event-driven invalidation. TTL is a safety net, not the consistency model.

## Stampede protection
Use request coalescing, jittered TTLs, bounded refresh concurrency, and controlled negative caching.

Cache failure degrades performance, not correctness; fallback must still respect load-shed limits.
