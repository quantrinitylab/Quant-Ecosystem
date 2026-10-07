# 05 — Data and Event Architecture

## Data planes
PostgreSQL/Prisma: transactional source of truth.
Redis: sessions, hot cache, rate limits and queues.
Kafka plus CDC/outbox: durable event backbone.
Meilisearch: fast full-text retrieval.
pgvector/Qdrant: semantic retrieval and recommendation candidates.
R2/object storage: large binary objects.

## Event contract
Every important state transition has event name, version, producer, schema, tenant/user scope, event id, correlation id and timestamp.

Examples: mail.message.sent.v1, mail.thread.archived.v1, chat.message.created.v1, gram.post.published.v1, tube.video.published.v1, cooks.render.completed.v1, ads.campaign.spend.v1.

## Outbox
Write domain state and outbox record in one transaction; publish asynchronously; consumers must be idempotent; projections must be rebuildable.

## Projection rule
Cross-product feeds, search and recommendations are projections, never alternate sources of truth.

## Governance
Every data class declares owner, retention, encryption class, tenant boundary, deletion/export behavior, legal hold behavior and AI access policy.