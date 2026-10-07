# QuantMail Backend — Drive / Attachment Events

Storage/security events may update Mail attachment state:
- attachment.scan_completed.v1
- attachment.scan_blocked.v1
- attachment.expired.v1

Drive events consumed for relationships:
- drive.file.created.v1
- drive.file.updated.v1
- drive.file.deleted.v1

Mail stores minimal relationship state.

## Idempotency

Repeated save requests must not accidentally create duplicate Drive files when an idempotency key is supplied.

## Security

Event payloads should avoid exposing private file contents to Mail consumers.
