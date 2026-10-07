# M15 — Mail Retention

## Data classes

Examples:
- message metadata
- message body
- attachment reference
- attachment object
- delivery diagnostics
- security assessment
- audit record
- search index projection
- embedding/vector projection
- temporary processing artifact

Each class has independent retention.

## Expiry

Retention workers identify eligible records using policy version and timestamps.

Deletion must cascade to derived systems:
- search
- vector index
- caches
- notifications
- temporary artifacts

## Holds

A legal/compliance hold can pause deletion for covered records.

Hold status is explicit and auditable.
