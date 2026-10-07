# M13 — SMTP Outbound

## Pipeline

Draft
-> validation
-> MIME assembly
-> content/attachment checks
-> queue
-> provider selection
-> SMTP/API submission
-> provider response normalization
-> state transition
-> delivery tracking

## Provider abstraction

Provider adapter contract:
- submit
- cancel where supported
- classify response
- parse delivery events
- health check

Business logic must not depend on a provider-specific response code.

## Retry

Retry only when failure classification says retryable.

Backoff uses bounded exponential strategy with jitter.

Never retry permanent recipient rejection.

## Idempotency

Outbound message has a stable internal send identity and deterministic idempotency key.

A timeout after provider submission must not automatically create a second message without reconciliation.
