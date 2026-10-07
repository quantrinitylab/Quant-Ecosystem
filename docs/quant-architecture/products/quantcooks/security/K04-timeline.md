# QuantCooks K04 Timeline — Security Contract

## Baseline

- Quant Account SSO; session token never in URLs.
- Project assets are owner-scoped; share/collaboration requires explicit invite.
- AI-generated content labeled; export pipeline must not execute asset-supplied code.

## Screen threats

- timeline mutations validated (no overlapping-clip corruption)

## Data exposure

- a resource ID copied from another account must not reveal metadata (per-resource authorization checks)
- logs must not include message bodies, media content, or secrets

