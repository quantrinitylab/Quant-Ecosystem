# M10 — Settings Security

## Threats

- preference tampering
- scope confusion
- account takeover
- stale writes
- malicious deep links
- step-up bypass
- session/device abuse
- policy downgrade through AI preferences

## Controls

- server-side authorization
- owner-domain enforcement
- explicit scopes
- versioned writes
- step-up authentication
- audit sensitive mutations
- secure session/device revocation
- no client-side authority
- no generic secret storage

Settings are configuration, not permission. A preference cannot grant authority the identity, organization or product policy does not grant.
