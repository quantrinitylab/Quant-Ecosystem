# M09 Backend — Attention Events

## Consumed events

- mail.message.received.v1
- mail.thread.attention_changed.v1
- mail.delivery.failed.v1
- calendar.event.updated.v1
- calendar.attendee.response_changed.v1
- drive.share.created.v1
- drive.access_request.created.v1
- quantgit.review.requested.v1
- quantgit.ci.failed.v1
- quanty.task.completed.v1
- quanty.approval.required.v1
- security.account.alert.v1

## Produced events

- attention.created.v1
- attention.updated.v1
- attention.resolved.v1
- attention.dismissed.v1
- notification.delivery.requested.v1
- notification.delivery.failed.v1

Events contain references and bounded metadata, not arbitrary source content.

## Delivery semantics

At-least-once ingestion is expected.
Consumers must be idempotent.
Ordering is only guaranteed within a declared source/entity scope.
