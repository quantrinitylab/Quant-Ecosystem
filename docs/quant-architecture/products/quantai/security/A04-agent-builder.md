# QuantAI A04 Agent Builder — Security Contract

## Baseline

- Quant Account SSO; session token never in URLs.
- Model API keys are server-side only; the browser never sees provider credentials.
- Agent tool execution requires explicit tool policy + approval where configured.

## Screen threats

- agent tool grants least-privilege; code execution sandboxed
- goals cannot grant themselves new capabilities

## Data exposure

- a resource ID copied from another account must not reveal metadata (per-resource authorization checks)
- logs must not include message bodies, media content, or secrets

