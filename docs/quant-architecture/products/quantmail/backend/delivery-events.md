# M13 Backend — Delivery Events

## Produced

- mail.outbound.queued.v1
- mail.outbound.submitted.v1
- mail.outbound.delivered.v1
- mail.outbound.deferred.v1
- mail.outbound.bounced.v1
- mail.outbound.failed.v1
- mail.outbound.cancelled.v1
- mail.inbound.accepted.v1
- mail.inbound.rejected.v1
- mail.delivery.complaint.v1
- mail.domain.authentication_changed.v1
- mail.delivery.health_changed.v1

Events are at-least-once.
Consumers must be idempotent.

Provider-specific payloads are normalized before crossing domain boundaries.
