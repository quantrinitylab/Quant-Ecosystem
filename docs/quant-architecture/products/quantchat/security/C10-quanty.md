# QuantChat C10 Quanty — Security Contract

## Baseline

- Quant Account SSO session; session token never in URLs.
- E2EE endpoints exist (`/api/e2ee/*`); message content treated as attacker-controlled.
- media uploads go through signed upload URLs (`/api/media/upload-url`).

## Screen threats

- AI suggestions must never exfiltrate thread content to third parties
- auto-reply requires explicit toggle; default off
- tool policy wins over message content (prompt-injection boundary)

## Data exposure

- a resource ID copied from another account must not reveal metadata (per-resource authorization checks)
- logs must not include message bodies, media content, or secrets

