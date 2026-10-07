# QuantChat C02 1:1 Chat — Security Contract

## Baseline

- Quant Account SSO session; session token never in URLs.
- E2EE endpoints exist (`/api/e2ee/*`); message content treated as attacker-controlled.
- media uploads go through signed upload URLs (`/api/media/upload-url`).

## Screen threats

- message content is attacker-controlled: sanitize before render, safe link policy
- disappearing messages: enforce server-side deletion, not just client hide
- link preview fetches must not SSRF internal endpoints
- voice note uploads: signed URLs, MIME/size limits, malware-scan state respected

## Data exposure

- a resource ID copied from another account must not reveal metadata (per-resource authorization checks)
- logs must not include message bodies, media content, or secrets

