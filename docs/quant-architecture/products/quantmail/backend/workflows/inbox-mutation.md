# QuantMail Workflow — Inbox Mutation

Example: archive a thread.

## Command path

1. client sends mail.thread.archive
2. API authenticates
3. authorization checks mailbox/thread access
4. load current thread version
5. validate expectedVersion
6. transaction updates authoritative state
7. transaction appends outbox event
8. commit
9. return accepted state + eventId
10. publisher emits mail.thread.archived.v1
11. projections consume
12. search index catches up
13. analytics records sanitized action
14. audit records sensitive operation when required

## Conflict

On expectedVersion mismatch:
- return THREAD_VERSION_CONFLICT
- include current version
- never silently overwrite

Client:
- refresh affected row
- preserve surrounding list state
- explain conflict only when user action requires it

## Failure matrix

DB transaction fails:
- no domain event
- typed error

Outbox delayed:
- command can still succeed
- projection becomes eventually consistent

Search unavailable:
- archive remains successful
- index catches up later

Quanty unavailable:
- no impact

Analytics unavailable:
- no impact

## Security

Audit sensitive commands such as:
- delete
- restore
- delegated access
- policy override

Never log message bodies, access tokens or provider secrets to general logs.
