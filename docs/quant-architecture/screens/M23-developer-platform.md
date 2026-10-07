# M23 — QuantMail Developer Platform

## Goal
Expose safe, versioned, observable APIs without exposing internal domain boundaries or bypassing product policy.

## Platform layers
Developer Portal → App registration → OAuth/authorization → API gateway → domain APIs → events/webhooks → developer observability.

## Principles
1. Public APIs are contracts, not database wrappers.
2. OAuth scopes are least-privilege capabilities.
3. Product authorization remains authoritative.
4. Webhooks are delivery mechanisms, not source of truth.
5. Breaking changes require explicit versioning and migration paths.
6. Developer convenience never bypasses security, privacy, abuse, or residency policy.
