# QuantWave W04 Communities — Security Contract

## Baseline

- Quant Account SSO; session token never in URLs.
- Post content sanitized before render.
- Spaces (live audio) require explicit join; no passive listening without membership.

## Screen threats

- join/leave are idempotent and server-authorized
- private community posts not visible to non-members

## Data exposure

- a resource ID copied from another account must not reveal metadata (per-resource authorization checks)
- logs must not include message bodies, media content, or secrets

