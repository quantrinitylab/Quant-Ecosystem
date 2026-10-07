# M15 Backend — Data Lifecycle Domain

## Ownership

Each domain owns its data lifecycle:
- Mail owns messages/threads
- Contacts owns contacts
- Calendar owns events
- Drive owns files
- Identity owns account/session data
- Quanty owns agent task records subject to memory policy

A platform lifecycle coordinator may orchestrate requests but does not become source-of-truth owner.

## Policy

A lifecycle policy defines:
- data class
- retention period
- trigger
- hold behavior
- deletion method
- export representation
- audit requirement

## Deletion

Deletion commands are scoped, idempotent and auditable.

Soft-delete may precede physical erasure where recovery/audit requirements require it.
