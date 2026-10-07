# QuantChat C01 Inbox — Security Contract

## Baseline

- Quant Account SSO session; session token never in URLs.
- E2EE endpoints exist (`/api/e2ee/*`); message content treated as attacker-controlled.
- media uploads go through signed upload URLs (`/api/media/upload-url`).

## Screen threats

- conversation list must not leak messages from conversations the user is not a member of
- unread counts derived server-side; client must not trust them for auth decisions

## Data exposure

- a resource ID copied from another account must not reveal metadata (per-resource authorization checks)
- logs must not include message bodies, media content, or secrets

