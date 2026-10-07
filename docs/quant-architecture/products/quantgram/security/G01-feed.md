# QuantGram G01 Feed — Security Contract

## Baseline

- Quant Account SSO; session token never in URLs.
- Media uploads via signed URLs; sanitizeMediaUrl applied on render.
- DM conversations are private to participants.

## Screen threats

- feed ranking must not leak private-account posts to non-followers
- recommendation endpoints rate-limited

## Data exposure

- a resource ID copied from another account must not reveal metadata (per-resource authorization checks)
- logs must not include message bodies, media content, or secrets

