# QuantChat C11 Notifications — Security Contract

## Baseline

- Quant Account SSO session; session token never in URLs.
- E2EE endpoints exist (`/api/e2ee/*`); message content treated as attacker-controlled.
- media uploads go through signed upload URLs (`/api/media/upload-url`).

## Screen threats

- when built: push tokens stored per-device, revocable; notification payloads minimal (no bodies)

## Data exposure

- a resource ID copied from another account must not reveal metadata (per-resource authorization checks)
- logs must not include message bodies, media content, or secrets

