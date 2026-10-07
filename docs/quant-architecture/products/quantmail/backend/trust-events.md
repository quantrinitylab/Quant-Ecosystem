# M14 Backend — Trust Events

## Consumed

- mail.inbound.accepted.v1
- mail.delivery.complaint.v1
- mail.domain.authentication_changed.v1
- identity.account.security_signal.v1
- security.attachment.scan_completed.v1
- security.url.assessment_completed.v1

## Produced

- mail.security.assessment_created.v1
- mail.security.warning_created.v1
- mail.security.quarantined.v1
- mail.security.released.v1
- mail.security.reported.v1
- mail.security.feedback_recorded.v1
- mail.security.reputation_changed.v1

Events are typed, versioned and idempotent.
