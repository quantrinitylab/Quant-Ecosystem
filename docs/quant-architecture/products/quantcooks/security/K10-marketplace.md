# QuantCooks K10 Marketplace — Security Contract

## Baseline

- Quant Account SSO; session token never in URLs.
- Project assets are owner-scoped; share/collaboration requires explicit invite.
- AI-generated content labeled; export pipeline must not execute asset-supplied code.

## Screen threats

- when built: payments server-side; seller payouts with verification; content review for listings

## Data exposure

- a resource ID copied from another account must not reveal metadata (per-resource authorization checks)
- logs must not include message bodies, media content, or secrets

