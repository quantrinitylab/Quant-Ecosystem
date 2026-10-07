# M23 — Public API Security

## Controls
- authentication
- authorization
- schema validation
- request size limits
- replay protection where needed
- abuse/rate controls
- SSRF-safe webhook handling
- audit logging
- secret rotation
- tenant isolation

## Sensitive operations
Sending mail, changing filters, exporting data, modifying security settings, or administrative actions require stronger scopes/policies and may require step-up authorization.

API keys and tokens are never accepted as proof of human approval for high-risk actions.
