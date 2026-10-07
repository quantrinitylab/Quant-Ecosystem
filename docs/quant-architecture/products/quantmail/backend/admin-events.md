# M11 Backend — Admin Events

## Events

- mail.domain.created.v1
- mail.domain.verified.v1
- mail.domain.policy_changed.v1
- mail.mailbox.suspended.v1
- mail.mailbox.restored.v1
- mail.alias.created.v1
- mail.alias.deleted.v1
- mail.group.policy_changed.v1
- mail.retention.policy_changed.v1
- mail.quota.changed.v1
- mail.security.policy_changed.v1

## Audit

Every committed admin mutation produces an auditable event or audit record.

Sensitive values are represented by metadata/reference, not raw secret material.

## Delivery

Events are at-least-once.
Consumers must be idempotent.
