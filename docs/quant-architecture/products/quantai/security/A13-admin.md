# QuantAI A13 Admin — Security Contract

## Baseline

- Quant Account SSO; session token never in URLs.
- Model API keys are server-side only; the browser never sees provider credentials.
- Agent tool execution requires explicit tool policy + approval where configured.

## Screen threats

- when built: RBAC; model changes audited; safety-review queue for flagged outputs

## Data exposure

- a resource ID copied from another account must not reveal metadata (per-resource authorization checks)
- logs must not include message bodies, media content, or secrets

