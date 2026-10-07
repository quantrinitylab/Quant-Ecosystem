# M12 Backend — Search Events

## Consumed
- mail.thread.created.v1
- mail.thread.updated.v1
- mail.message.received.v1
- mail.message.updated.v1
- mail.message.deleted.v1
- mail.label.changed.v1
- mail.security_classification.changed.v1
- drive.file.updated.v1
- drive.file.deleted.v1
- calendar.event.updated.v1
- calendar.event.deleted.v1
- quantgit.object.updated.v1
- quantgit.object.deleted.v1

## Produced
- search.document.indexed.v1
- search.document.deleted.v1
- search.reindex.requested.v1
- search.reindex.completed.v1
- search.index_lag.alert.v1

At-least-once delivery is expected; consumers must be idempotent.
