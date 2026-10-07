# M13 — IMAP Sync

## Responsibilities

- mailbox discovery
- folder synchronization
- UID tracking
- flags
- message fetch
- incremental sync
- reconnect/recovery

## Sync cursor

Maintain per-mailbox:
- server identity
- folder
- UIDVALIDITY
- last known UID
- sync state
- checkpoint

UIDVALIDITY changes invalidate unsafe cursors and trigger controlled resynchronization.

## Idempotency

Message identity and provider UID mapping prevent duplicate local messages.

Sync failures are recoverable and observable.
