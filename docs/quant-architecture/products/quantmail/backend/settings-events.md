# M10 Backend — Settings Events

## Events

- identity.profile.updated.v1
- identity.security_policy.updated.v1
- mail.settings.updated.v1
- mail.alias.updated.v1
- mail.signature.updated.v1
- attention.preferences.updated.v1
- quanty.preferences.updated.v1
- quanty.memory_policy.updated.v1
- device.registered.v1
- device.revoked.v1

## Semantics

Events describe committed changes.

No event is emitted for a rejected validation or failed authorization.

Consumers must be idempotent.

Sensitive values are not placed into event payloads when a metadata-only signal is sufficient.
