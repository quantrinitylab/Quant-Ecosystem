# QuantAI A11 Device Control — Security Contract

## Baseline

- Quant Account SSO; session token never in URLs.
- Model API keys are server-side only; the browser never sees provider credentials.
- Agent tool execution requires explicit tool policy + approval where configured.

## Screen threats

- device commands require fresh pairing authorization; stale pairings revoked
- screen view is sensitive — require explicit per-session consent where applicable
- command allowlist enforced server-side; no raw shell passthrough

## Data exposure

- a resource ID copied from another account must not reveal metadata (per-resource authorization checks)
- logs must not include message bodies, media content, or secrets

