# QuantChat C06 Media — Security Contract

## Baseline

- Quant Account SSO session; session token never in URLs.
- E2EE endpoints exist (`/api/e2ee/*`); message content treated as attacker-controlled.
- media uploads go through signed upload URLs (`/api/media/upload-url`).

## Screen threats

- story privacy settings enforced server-side on view/reply
- media uploads: signed URLs, size/MIME limits, EXIF/GPS stripping policy
- AR lens consent records (`/api/ar-lenses/consent`) before camera processing

## Data exposure

- a resource ID copied from another account must not reveal metadata (per-resource authorization checks)
- logs must not include message bodies, media content, or secrets

