# Payment Webhooks

## Ingestion
Provider callback → signature/authentication → timestamp/replay validation → durable raw evidence reference → dedupe → schema normalization → reconciliation → state transition → outbox event.

## Ordering
Events may arrive late or out of order. State transitions require version/timestamp/provider-state checks.

## Replay
Duplicate callbacks are safe. Replay tools require privileged access, explicit scope, and audit.

## Failure
If processing fails after durable ingestion, the event remains retryable. No event is acknowledged as business-successful merely because it was received.
