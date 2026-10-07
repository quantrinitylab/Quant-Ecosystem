# Implementation Plan: QuantMail as Central OAuth2 Provider

**Date:** June 09, 2026  
**Status:** Draft  
**Owner:** Quant Ecosystem Security Team  
**Related Packages:** `@quant/auth`, `@quant/server-core`, `quantmail` backend, `packages/database`

## 1. Executive Summary

QuantMail will serve as the **central OAuth2 Authorization Server (AS)** and Identity Provider (IdP) for the entire Quant Ecosystem (13+ apps including QuantChat, QuantSync, QuantDrive, etc.).

This plan details the transformation from the current per-app JWT issuance to a standards-compliant, reliable OAuth2 provider supporting:

- Authorization Code flow with **PKCE** (mandatory for public clients)
- **JWT** access tokens (short-lived) + **Refresh Tokens** with rotation
- Persistent **session management** with revocation
- Token introspection, JWKS, revocation endpoints
- First-party SSO + third-party developer integrations

The goal is production-grade reliability, security, and seamless integration across the ecosystem.

## 2. Current State Analysis

**Existing Components:**

- `packages/auth/src/providers/quantmail-provider.ts`: In-memory `QuantMailProvider` class with PKCE support, client registration for ecosystem apps, TokenService for JWT/refresh.
- `packages/auth/src/services/token-service.ts`: JWT creation/validation (jose), refresh token families, revocation tracking (in-memory Maps).
- `packages/federation/src/developer-platform/oauth2-provider.ts`: Similar in-memory OAuth2Provider.
- `packages/database/prisma/schema.prisma`: Has `User`, `Session`, `RefreshToken`, `OAuthAccount` models, but **missing** `OAuthClient`, `AuthorizationCode`, `OAuthToken` models.
- `quantmail/backend/app.ts` + `@quant/server-core`: Uses HS256 JWT verification via `requireAuth` plugin. JWT_SECRET, issuer="quantmail", audience="quant-ecosystem".
- Frontend: Login flows, AuthGuard, but no full OAuth consent/login UI for AS.
- No dedicated `/oauth/*` routes in QuantMail backend yet.
- Current auth is internal JWT; not a full OAuth2 server.

**Gaps:**

- In-memory storage (not reliable/persistent across restarts or scaled instances).
- No OAuth2 endpoints (/authorize, /token, /revoke, /.well-known/jwks.json).
- No consent screen or user-facing OAuth login flow.
- Limited session management tied to OAuth.
- No client registration API or developer portal integration.
- HS256 vs recommended RS256 for public key distribution.
- No rate limiting, audit logging, or advanced security on auth flows.

## 3. Goals & Non-Functional Requirements

- **Reliability:** Persistent storage, horizontal scaling support (Redis for sessions/codes if needed), graceful degradation.
- **Security:** OWASP OAuth2 best practices, PKCE enforcement, token rotation, short TTLs, consent, audit logs.
- **Performance:** <200ms authorize/token responses, support 10k+ concurrent sessions.
- **Compliance:** Support for scopes, JWT claims (sub, scopes, app, jti), revocation.
- **Integration:** Zero-downtime migration for other apps; SDK updates.

**Success Metrics:**

- All first-party apps authenticate via QuantMail OAuth2.
- Third-party clients can register and obtain tokens.
- Full token lifecycle (issue → refresh → revoke) works reliably.
- Security audit passed (no critical findings).

## 4. Technical Architecture

**Core Components to Enhance/Integrate:**

- **OAuth2 Endpoints** (in `quantmail/backend/routes/oauth.ts` or via Fastify plugin):
  - `GET /oauth/authorize` — Login + consent UI (redirects to login if needed)
  - `POST /oauth/token` — Exchange code/refresh for tokens
  - `POST /oauth/revoke`
  - `POST /oauth/introspect`
  - `GET /.well-known/jwks.json` (for RS256 public keys)
  - `GET /oauth/.well-known/openid-configuration` (discovery)

- **Storage Layer:**
  - Extend Prisma: Add `OAuthClient`, `AuthorizationCode`, `AccessToken` (or use RefreshToken + new models), `OAuthConsent`.
  - Use PostgreSQL (via Prisma) for persistence.
  - Redis (existing in server-core) for short-lived codes, rate limits, session cache.

- **Token Strategy:**
  - Access Token: JWT (RS256 recommended for federation), 15-60 min expiry, claims: sub, email, scopes[], app, jti, iss=quantmail, aud.
  - Refresh Token: Opaque or JWT, 7-30 days, one-time use with family tracking (reuse detection → revoke family).
  - Session: Link to `Session` model + token jti.

- **PKCE:** Enforce `code_challenge` + `code_challenge_method=S256` for all public clients (mobile, SPA). Validate in token exchange using existing `validateCodeChallenge`.

- **Session Management:**
  - Create `Session` on successful login/consent.
  - Support "logout everywhere" by revoking all refresh tokens/sessions for user.
  - Device tracking (from DeviceLoginInfo).

- **JWT Evolution:** Keep HS256 for internal service-to-service if needed, but issue RS256 for cross-app OAuth. Add JWKS endpoint. Update `server-core` auth plugin to support both or migrate to RS256.

- **Dependencies:**
  - Reuse `@quant/auth` (QuantMailProvider, TokenService) — move logic to DB-backed services.
  - Integrate with existing User auth (password, 2FA, WebAuthn from docs).
  - Use `fastify-rate-limit`, `fastify-helmet`, CSRF protection.

## 5. Security Best Practices (Mandatory)

1. **PKCE Enforcement:** Reject authorization requests without `code_challenge` for non-confidential clients. Use S256 only.
2. **Token Rotation:** On every refresh, issue new refresh token and revoke old. Track families to detect reuse.
3. **Short-Lived Tokens:** Access tokens ≤ 15min in prod. Refresh tokens rotated and bound to sessions.
4. **Consent & Scopes:** Explicit user consent screen listing requested scopes. Granular per-client.
5. **State & Nonce:** Require `state` param; validate on callback. Support nonce for OIDC if added later.
6. **Rate Limiting:** 10 req/min on /authorize, 5/min on /token per IP/client. Use Redis.
7. **Secret Management:** Client secrets hashed (bcrypt). Never log secrets. Use env for JWT private key.
8. **HTTPS + HSTS:** Enforce TLS. Redirects must be exact match (no open redirect).
9. **Input Validation:** Strict Zod schemas for all requests. Timing-safe comparisons.
10. **Revocation:** Support token revocation; propagate to all services via events or shared Redis blacklist.
11. **Audit Logging:** Log all auth events (success/failure, client, scopes, IP) to secure log sink.
12. **Threat Mitigation:** Brute-force protection on login, device fingerprinting, anomaly detection.
13. **Data Protection:** Encrypt sensitive fields at rest if needed. GDPR/CCPA consent tracking.
14. **JWKS & Key Rotation:** Rotate signing keys periodically; support multiple keys in JWKS.
15. **Error Handling:** Never leak internal details; use standard OAuth error codes (invalid_grant, etc.).

**OWASP Alignment:** Follow OAuth 2.0 Security Best Current Practices (RFC 9700), PKCE (RFC 7636), JWT (RFC 7519).

## 6. Detailed Implementation Steps (Phased)

### Phase 1: Foundation (1-2 weeks)

- Update Prisma schema (`packages/database/prisma/schema.prisma`):
  - Add `model OAuthClient { ... }` (clientId, secretHash, name, redirectUris[], allowedScopes[], grantTypes[], isFirstParty, app, createdByUserId, etc.)
  - Add `model AuthorizationCode { code, clientId, userId, redirectUri, scopes[], codeChallenge, codeChallengeMethod, expiresAt, used }`
  - Enhance `RefreshToken` if needed; add `AccessToken` or `OAuthToken` model for full tracking.
  - Add `OAuthConsent` model for user consents.
- Run migration.
- Create DB-backed services in `@quant/auth` or `quantmail/backend/services/oauth/`:
  - `OAuthClientService`, `AuthorizationCodeService`, `TokenService` (extend existing, replace Maps with Prisma + Redis).
- Update `TokenService` to support RS256 (generate keypair, export JWKS).

### Phase 2: Core OAuth2 Endpoints (2 weeks)

- Create `quantmail/backend/routes/oauth.ts`:
  - Implement `authorize` handler: Validate client/redirect/scope/PKCE, redirect to login/consent UI if unauth, generate code on consent.
  - Implement `token` handler: Validate grant_type, PKCE verifier, issue JWT access + refresh (use existing TokenService).
  - Implement revoke, introspect.
- Integrate into `quantmail/backend/app.ts`: `app.register(oauthRoutes, { prefix: '/oauth' })`.
- Add login/consent UI pages in `quantmail/src/app/oauth/` (or shared UI components): Consent screen showing app name, requested scopes, "Allow/Deny".
- Update `quantmail` frontend to support OAuth callback flows.

### Phase 3: Session & Refresh Management (1 week)

- Enhance `Session` model usage: Create session on login, associate with refresh tokens.
- Implement session invalidation API (`POST /sessions/revoke`).
- Full refresh token flow with family tracking and reuse detection (revoke entire family on reuse).
- Add "active sessions" dashboard in user settings (QuantMail UI).

### Phase 4: Integration & Migration (1-2 weeks)

- Update `packages/auth` SDK: Provide `QuantMailOAuthClient` helper for other apps (handle PKCE, token storage).
- Update `server-core` auth plugin to optionally fetch public keys from JWKS or support RS256 verification.
- Migrate existing JWT issuance in other services to use QuantMail OAuth2.
- Update quantmail-provider.ts and federation to use new DB services.
- Add client registration endpoint (`POST /oauth/clients` protected by admin scopes).

### Phase 5: Security Hardening, Testing & Docs (1 week)

- Add rate limiting, helmet, CSRF.
- Comprehensive tests (unit for services, e2e for flows using existing `e2e/tests/auth/oauth-flow.spec.ts`).
- Security review/pen-test simulation.
- Update docs: `docs/site/guides/authentication.md`, `docs/federation.md`, API reference.
- JWKS endpoint and OpenID config.
- Monitoring: Prometheus metrics for auth success rate, token issuance latency.

**Total Estimated Effort:** 6-8 weeks for core team.

## 7. How Other Apps Will Integrate

### First-Party Apps (e.g., QuantChat, QuantDrive)

- Use updated `@quant/auth` SDK:

  ```ts
  import { createOAuthClient } from '@quant/auth';

  const oauth = createOAuthClient({
    clientId: 'quantchat-client',
    redirectUri: 'https://chat.quant.app/auth/callback',
    scopes: ['profile:read', 'messages:read'],
  });

  // PKCE flow
  const { url, codeVerifier } = await oauth.getAuthorizationUrl();
  // Redirect user to url (hosted on mail.quant.app/oauth/authorize)
  const tokens = await oauth.exchangeCode(code, codeVerifier);
  ```

- Mobile: Use deep linking (`quantchat://auth/callback`) + PKCE.
- Store tokens securely (Keychain/Keystore on mobile, httpOnly cookies on web).

### Third-Party Developers

1. Register app via Developer Portal (future `quant.dev` or in QuantMail admin).
2. Receive `client_id` + `client_secret` (for confidential) or PKCE-only.
3. Implement standard OAuth2:
   - Redirect to `https://mail.quant.app/oauth/authorize?client_id=...&redirect_uri=...&response_type=code&scope=...&code_challenge=...&code_challenge_method=S256&state=...`
   - Handle callback, exchange at `/oauth/token`.
4. Use refresh tokens for long-lived access.
5. Follow scope allowlist (THIRD_PARTY_ALLOWED_SCOPES).

### Example Token Response

```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "rt_...",
  "scope": "profile:read email:read"
}
```

**Migration Path:** Existing internal JWTs phased out in favor of OAuth-issued tokens. Backward compat layer for 1 release.

## 8. Risks & Mitigations

- **Risk:** Breaking existing auth in other apps → Mitigation: Feature flags, parallel support, gradual rollout.
- **Risk:** Performance on DB for high-volume token ops → Mitigation: Redis caching for codes/clients, connection pooling.
- **Risk:** Key compromise → Mitigation: Key rotation schedule, HSM if needed, short token TTLs.
- **Risk:** Consent fatigue or phishing via malicious clients → Mitigation: Strict redirect URI validation, user education, verified clients badge.

## 9. Next Steps & Ownership

- **Immediate:** PR to add Prisma models + DB services.
- **Review:** Security team sign-off on flows.
- **Dependencies:** Completion of user auth flows in QuantMail, Redis availability.
- **Deliverables:** Working OAuth2 endpoints in staging, updated SDK, integration tests passing for 3+ apps.

This plan ensures QuantMail becomes a **reliable, secure, central OAuth2 provider** enabling seamless SSO and ecosystem-wide authentication.

---

_References: RFC 6749 (OAuth2), RFC 7636 (PKCE), RFC 7519 (JWT), existing Quant auth package code, server-core auth plugin._
