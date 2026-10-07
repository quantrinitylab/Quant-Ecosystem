# M17 — Search Scale

Pipeline: PostgreSQL truth → event/CDC relay → projection/index → lexical/vector retrieval → authorization filtering → ranking.

## Controls
Bound candidate counts, apply authorization early, isolate indexing workers from interactive search, backpressure reindex jobs, and prioritize fresh writes for active users.

Reindexing is resumable, checkpointed, throttled, and observable. It must not starve interactive search.

Search may be eventually consistent; authoritative refresh remains available after mutations.
