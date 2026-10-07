# QuantAI A07 Automations — Security Contract

## Baseline

- Quant Account SSO; session token never in URLs.
- Model API keys are server-side only; the browser never sees provider credentials.
- Agent tool execution requires explicit tool policy + approval where configured.

## Screen threats

- automation steps run with the user's own permissions — no elevation
- schedules rate-limited; runaway loops must have kill switches

## Data exposure

- a resource ID copied from another account must not reveal metadata (per-resource authorization checks)
- logs must not include message bodies, media content, or secrets

