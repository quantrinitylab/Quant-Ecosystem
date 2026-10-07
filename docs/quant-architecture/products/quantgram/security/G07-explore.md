# QuantGram G07 Explore — Security Contract

## Baseline

- Quant Account SSO; session token never in URLs.
- Media uploads via signed URLs; sanitizeMediaUrl applied on render.
- DM conversations are private to participants.

## Screen threats

- explore must not surface private-account content

## Data exposure

- a resource ID copied from another account must not reveal metadata (per-resource authorization checks)
- logs must not include message bodies, media content, or secrets

