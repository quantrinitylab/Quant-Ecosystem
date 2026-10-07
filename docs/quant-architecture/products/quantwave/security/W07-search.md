# QuantWave W07 Search — Security Contract

## Baseline

- Quant Account SSO; session token never in URLs.
- Post content sanitized before render.
- Spaces (live audio) require explicit join; no passive listening without membership.

## Screen threats

- when built: search respects blocks/mutes and private-community boundaries

## Data exposure

- a resource ID copied from another account must not reveal metadata (per-resource authorization checks)
- logs must not include message bodies, media content, or secrets

