# QuantMax X05 Chat Handoff — Security Contract

## Baseline

- Quant Account SSO; session token never in URLs.
- Dating context: location data minimized; precise location never shared without explicit opt-in.
- Reports/blocks must take effect immediately (server-side).

## Screen threats

- room chat participants-only; no cross-room leakage

## Data exposure

- a resource ID copied from another account must not reveal metadata (per-resource authorization checks)
- logs must not include message bodies, media content, or secrets

