# M09 — Attention Security

## Threats

- notification spoofing
- cross-user event injection
- sensitive preview leakage
- malicious deep links
- notification enumeration
- device endpoint takeover
- security-alert suppression

## Controls

- authenticate every producer
- validate event schema and source identity
- authorize every list/read/mutation
- use opaque source references
- keep notification previews bounded
- allow privacy-sensitive preview suppression
- sign/validate device registration
- server-side deep-link authorization
- security events cannot be dismissed by generic bulk actions

Notification content is untrusted presentation data and must never become authorization.
