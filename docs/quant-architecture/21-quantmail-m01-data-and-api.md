# QuantMail M01 — Data and API Design

## Read model
Use a purpose-built thread projection rather than reconstructing every row from raw messages.

Fields: thread id, latest message id, mailbox ids, participant summary, subject/snippet, timestamp, unread count, labels, importance, attachment presence, security classification and projection version.

## Consistency
Authoritative mutation status wins. Safe reversible UI actions may be optimistic but must reconcile against server state.

## Pagination
Cursor pagination. The client cannot use cursor contents to bypass authorization.

## Typed errors
UNAUTHENTICATED, FORBIDDEN, INVALID_ARGUMENT, NOT_FOUND, CONFLICT, RATE_LIMITED, DEPENDENCY_UNAVAILABLE, INTERNAL.

## Events
mail.thread.read.v1, mail.thread.archived.v1, mail.thread.starred.v1, mail.thread.label_changed.v1, mail.thread.deleted.v1.

Every event contains tenant/user scope, event id, correlation id and source version.

## Search
Projection changes enqueue indexing. Search failure never blocks inbox rendering.

## Cache
Scope cache by user/mailbox/filter. Never reuse authorization-sensitive cache across users or tenants.

## Tests
Schema, authorization, pagination, idempotency, event emission, search outage and delayed event publisher.