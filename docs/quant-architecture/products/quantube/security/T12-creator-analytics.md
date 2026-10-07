# QuanTube T12 Creator Analytics — Security Contract

## Baseline

- Quant Account SSO; session token never in URLs.
- Video URLs signed/expiring; no hotlinking of restricted content.
- Payments/payouts are server-side; the client never handles card data.

## Screen threats

- earnings data strictly owner-scoped
- payout actions require step-up verification

## Data exposure

- a resource ID copied from another account must not reveal metadata (per-resource authorization checks)
- logs must not include message bodies, media content, or secrets

