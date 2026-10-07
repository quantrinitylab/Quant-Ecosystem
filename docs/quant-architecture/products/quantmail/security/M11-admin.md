# M11 — Admin Security

## Threats

- privilege escalation
- tenant/org crossover
- bulk abuse
- domain takeover
- policy downgrade
- audit tampering
- secret leakage
- compromised admin session

## Controls

- server-side role/capability enforcement
- organization boundary checks
- domain ownership verification
- step-up authentication for sensitive changes
- impact previews
- idempotent commands
- immutable/auditable administrative history
- secret-manager boundary
- separation of identity, security and mail ownership

Admin UI visibility is never treated as authorization.
