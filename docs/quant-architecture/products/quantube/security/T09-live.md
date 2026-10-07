# QuanTube T09 Live — Security Contract

## Baseline

- Quant Account SSO; session token never in URLs.
- Video URLs signed/expiring; no hotlinking of restricted content.
- Payments/payouts are server-side; the client never handles card data.

## Screen threats

- live chat rate-limited and moderated; chat content sanitized
- stream keys never exposed to viewers

## Data exposure

- a resource ID copied from another account must not reveal metadata (per-resource authorization checks)
- logs must not include message bodies, media content, or secrets

