# QuantAI A01 Chat — Security Contract

## Baseline

- Quant Account SSO; session token never in URLs.
- Model API keys are server-side only; the browser never sees provider credentials.
- Agent tool execution requires explicit tool policy + approval where configured.

## Screen threats

- stream endpoint must enforce per-user rate limits
- conversation IDs unguessable; no cross-user access
- prompt content is user data — never logged in plaintext at info level

## Data exposure

- a resource ID copied from another account must not reveal metadata (per-resource authorization checks)
- logs must not include message bodies, media content, or secrets

