# M23 — API Pagination & Errors

## Pagination
Prefer opaque cursor pagination. Cursors encode bounded query state and are scoped to the authenticated principal.

## Errors
Stable machine-readable error codes plus human-readable messages. Do not expose stack traces, SQL, internal service names, credentials, or security-sensitive detection details.

## Partial failure
Cross-domain endpoints return bounded per-domain status rather than masking an authorization or dependency failure as empty data.
