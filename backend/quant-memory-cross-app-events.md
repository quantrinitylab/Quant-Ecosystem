# M41 — Cross-App Memory Events

Products emit versioned domain events; Memory consumes them through the event relay. Examples: mail.thread.updated.v1, calendar.event.updated.v1, drive.file.updated.v1, contacts.person.updated.v1, git.pull_request.updated.v1 and git.issue.updated.v1.

Memory also consumes created/updated/deleted/permission-changed/corrected/expired signals. Consumers are at-least-once and idempotent. Replay uses current policy rather than historical authorization assumptions.