# M15 — Lifecycle Events

## Produced

- data.export.requested.v1
- data.export.ready.v1
- data.export.expired.v1
- data.deletion.requested.v1
- data.deletion.started.v1
- data.deletion.verified.v1
- data.deletion.blocked.v1
- data.retention.expired.v1
- data.hold.created.v1
- data.hold.released.v1

Events carry references and bounded metadata.

Consumers are idempotent.
Lifecycle events never contain raw secrets or unnecessary message content.
