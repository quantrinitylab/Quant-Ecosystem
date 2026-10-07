# M21 — Encryption & Key Separation

## At rest
Encrypt databases, backups, object storage, and relevant queues.

## Key separation
Separate keys or key scopes for:
- identity/authentication
- transactional data
- object storage
- backups
- security evidence
- high-sensitivity data

## In transit
Use authenticated TLS between clients, edge, services, and data systems where supported.

## Key lifecycle
Creation, rotation, revocation, escrow/recovery where required, and access are audited.

Encryption does not replace authorization; decrypted data remains subject to policy.
