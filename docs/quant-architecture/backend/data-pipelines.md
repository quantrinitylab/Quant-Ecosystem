# Data Pipelines

Pipeline stages:
ingest → validate → dedupe → normalize → transform → quality check → publish.

Pipelines support:
- checkpointing
- replay
- backfill
- dead-letter/quarantine
- schema compatibility
- bounded retries
- observability

Backfills are isolated from normal production traffic and are auditable.
