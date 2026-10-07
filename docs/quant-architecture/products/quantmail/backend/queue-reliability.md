# M16 — Queue Reliability

## Queues

- outbound mail
- inbound processing
- search indexing
- notification delivery
- attachment scanning
- lifecycle jobs
- Quanty execution

## Guarantees

Consumers are idempotent.
Messages have bounded retry policy.
Poison messages enter controlled dead-letter handling.
Queue depth and age are observable.

## Recovery

Replay requires:
- authorization
- bounded scope
- idempotency
- auditability

Never blindly replay a mutation queue.
