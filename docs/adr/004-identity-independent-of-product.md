# ADR-004: Identity Must Be Independent of Any Product

## Status

ACCEPTED (CEO directive, long-term architectural evolution)

## Date

2026-07-07

## Context

CEO observation: "Agar kal QuantMail ka naam badal diya, ya mail app hata diya,
Identity nahi tootni chahiye."

Current state: QuantMail backend owns `/auth/login`, `/auth/register`, `/oauth/*`.
The `@quant/auth` package holds the logic, but it is CONSUMED through the
QuantMail app. If QuantMail were removed, there is no standalone auth endpoint.

This violates Law 1: "Identity exists before any app. Identity survives every app."

## Options Considered

### Option A — Keep Identity in QuantMail (current)
**Pros:** Already working, fewer moving parts today
**Cons:** Violates Law 1, tight coupling, confuses "mail app" with "identity provider"

### Option B — Extract Identity Service (separate deployment)
**Pros:** True independence, can scale independently, clear SRP, other apps register directly
**Cons:** New service to maintain, migration complexity, another k8s deployment

### Option C — Identity as a layer within server-core (embedded in every app)
**Pros:** No new service, every app can serve auth
**Cons:** Distributed state problem, token consistency, which instance is authoritative?

## Decision

**Option B — Extract Identity Service.** But NOT immediately.

Implementation roadmap:
1. **Now**: ADR recorded. No code change.
2. **Q1**: `@quant/auth` remains the package. QuantMail remains the consumer.
3. **Q2**: New `services/identity/` service created. Shares `@quant/auth` package.
   Auth routes (`/auth/*`, `/oauth/*`, `/.well-known/*`) move to identity service.
4. **Q3**: QuantMail and all apps consume identity via `IdentityClient` (HTTP).
   QuantMail is just another OAuth client, not the auth root.
5. **Q4**: QuantMail's special status removed. Identity service is the sole JWKS issuer.

## Consequences

- Identity becomes infrastructure (like PostgreSQL — always available, not tied to one app)
- Every app authenticates against the identity service
- QuantMail loses its "auth root" privilege but gains focus on its REAL job (email)
- New apps can be added without touching identity code
- Federation ("Sign In with Quant") becomes trivial (identity service IS the IdP)

## Future Impact

- 1yr: Identity service runs independently, survives any single app failure
- 3yr: Identity becomes Quant's developer platform entry point (OAuth apps, SDKs)
- 5yr: Identity service is the most battle-tested, highest-uptime component

## Complexity Assessment

SHORT TERM: Slightly increases complexity (new service to deploy).
LONG TERM: Massively REDUCES complexity. Apps don't own identity. Identity is a given.

---

*Signed by: Kiro (Principal Systems Engineer) | Approved by: CEO*
