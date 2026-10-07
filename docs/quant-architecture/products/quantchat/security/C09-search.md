# QuantChat C09 Search — Security Contract

## Baseline

- Quant Account SSO session; session token never in URLs.
- E2EE endpoints exist (`/api/e2ee/*`); message content treated as attacker-controlled.
- media uploads go through signed upload URLs (`/api/media/upload-url`).

## Screen threats

- when built: search must respect conversation membership; no cross-user leakage via index

## Data exposure

- a resource ID copied from another account must not reveal metadata (per-resource authorization checks)
- logs must not include message bodies, media content, or secrets

