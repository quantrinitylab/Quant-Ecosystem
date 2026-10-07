# QuantMail Backend — Inbox Events

Transport: shared event bus.

Every event carries:
- eventId
- schema version
- occurredAt
- actorId/serviceId
- correlationId
- tenant/user/mailbox scope

## Event set

mail.thread.read.v1
mail.thread.unread.v1
mail.thread.starred.v1
mail.thread.unstarred.v1
mail.thread.archived.v1
mail.thread.restored.v1
mail.thread.deleted.v1
mail.thread.label_changed.v1

Label changes include enough before/after or operation data for deterministic projection replay.

## Consumers

Search indexer:
- update search document

Notification:
- update unread/attention signals

Analytics:
- sanitize and aggregate actions
- never copy message bodies unnecessarily

Quanty context:
- consume minimal approved metadata

Audit:
- record security-sensitive operations

## Ordering and delivery

- order by aggregate key when needed
- consumers are idempotent
- bounded retry
- dead-letter routing
- operator visibility
- replay tooling

Third-party context services are never synchronous dependencies of core mail mutations.
