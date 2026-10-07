# QuantMail M07 Attachments — Security

## Threat model

Attachments are untrusted objects and can contain:
- malware
- active HTML/script
- malicious filenames
- oversized payloads
- content intended to exploit previewers

## Controls

- scan before preview/download
- MIME/content validation
- isolated preview
- short-lived object capabilities
- authorization at every access
- size/time limits
- safe filename handling
- no automatic execution

## Drive

Saving to Drive is a new authorization boundary.
Mail cannot infer that a user has Drive write access.

## Logging

Log metadata and correlation IDs as permitted.
Do not log private file contents or object-store credentials.
