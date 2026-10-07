# QuantWave W10 Admin — Security Contract

## Baseline

- Quant Account SSO; session token never in URLs.
- Post content sanitized before render.
- Spaces (live audio) require explicit join; no passive listening without membership.

## Screen threats

- when built: RBAC; moderation actions audited with appeal path

## Data exposure

- a resource ID copied from another account must not reveal metadata (per-resource authorization checks)
- logs must not include message bodies, media content, or secrets

