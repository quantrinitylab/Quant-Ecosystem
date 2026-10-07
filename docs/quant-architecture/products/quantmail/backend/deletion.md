# M15 — Deletion Architecture

## Request

DELETE_REQUESTED -> VALIDATING -> SCHEDULED -> ERASING -> VERIFIED

Possible:
-> BLOCKED_BY_HOLD
-> FAILED_RETRYABLE
-> FAILED_TERMINAL

## Verification

Deletion is not complete because the primary row disappeared.

Verify:
- primary store
- search projection
- vector projection
- caches
- object storage
- notification references
- derived analytics where applicable

## Idempotency

Repeated deletion requests converge on the same final state.

Deletion jobs must be resumable.
