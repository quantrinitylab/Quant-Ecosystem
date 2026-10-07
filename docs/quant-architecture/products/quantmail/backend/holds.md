# M15 — Compliance Holds

## Hold

A hold targets a declared scope:
- user
- mailbox
- thread
- message
- date range
- data class

## Rules

Hold creation:
- requires authorized role
- records scope and reason
- records creation time
- produces audit event

Deletion workers must evaluate active holds before erasure.

Hold release is itself auditable.

A hold does not automatically grant access to held content.
