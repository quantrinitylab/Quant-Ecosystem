# ADR-002: Identity-First Architecture (QuantMail as Auth Root)

## Status

ACCEPTED (core architectural decision)

## Date

2025-01-15

## Context

Quant Ecosystem has 16+ apps that need unified identity. The identity system
must be the FIRST thing built correctly — it is P0 by CEO directive.

Requirements:
- Single sign-on across all Quant apps
- OAuth 2.1 + PKCE for third-party and first-party clients
- Token-based inter-service auth (no shared sessions)
- Refresh token rotation with reuse detection
- KMS-backed key rotation without downtime

## Options Considered

### Option A — QuantMail as Auth Root (SSO provider)
**Pros:** Natural email-based identity, single registration point, OAuth issuer
**Cons:** Tight coupling to one app, single point of failure

### Option B — Dedicated Identity Service
**Pros:** Clean separation, can scale independently
**Cons:** Another service to build/maintain, adds network hop

### Option C — Third-party Auth (Auth0, Clerk)
**Pros:** Instant production-grade, handles edge cases
**Cons:** Vendor lock-in, no control over identity layer, cost at scale

## Decision

Option A — QuantMail as Auth Root.
Reasoning: Identity IS the product. Outsourcing it means outsourcing the moat.
QuantMail's email address IS the identity (user@quantmail.in). The auth package
(`@quant/auth`) encapsulates the logic; QuantMail is just the first consumer.

In future (ADR TBD): extract a dedicated `identity-service` from the auth
package when we need to decouple the mail app from identity operations.

## Consequences

- `@quant/auth` package is the single source of truth for token operations
- Every backend imports `@quant/server-core` which enforces JWT verification
- JWT issuer/audience must be consistent across ALL apps (current: `https://quant.app` / `quant-platform`)
- QuantMail backend owns `/auth/login`, `/auth/register`, `/oauth/*`

## Future Impact

- 1yr: Extract identity-service when other apps need direct registration
- 3yr: Federation (Sign In with Quant) becomes possible
- 5yr: Identity becomes Quant's developer platform entry point

## Complexity Assessment

REDUCES complexity: one identity, one token, one verification path.
Every app trusts one JWT shape. No session sync needed.

---

*Signed by: Kiro (Principal Systems Engineer) | Reviewed by: CEO*
