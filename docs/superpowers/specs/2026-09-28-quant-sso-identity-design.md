# Quant Ecosystem — Unified Google-Class SSO & Identity (DESIGN ONLY)

- Status: DRAFT / for owner decision
- Date: 2026-09-28
- Scope: Design specification only. No code, no migrations, no git actions.
- Owner complaint (verbatim): "koi google ke tarah gmail se login hota hai waisa kuch nhi hai"
  (there is no Google-account-style login / account-chooser / one-identity-across-all-apps today).

## 0. What the owner is asking for, in plain terms

Google's model has four visible properties the owner wants replicated:

1. One identity (one Quant Account) works across every app with a single password.
2. Sign in once, and every other app is already signed in (no re-typing).
3. A Google-style account chooser ("Choose an account" + "Use another account") with
   multiple simultaneously-signed-in accounts.
4. One "sign out of all" that logs the identity out everywhere.

This document specifies how to deliver all four on the real Quant monorepo, honestly
separating what already exists from what must be built, with file:line evidence.

## 1. Executive summary (read this first)

The ecosystem already contains a genuinely solid, DB-backed OAuth 2.1 / OIDC provider and a
secure browser-session pattern in QuantMail — but **none of the cross-app flows use them.**
What is actually live between apps is an insecure client-side handoff: real JWTs are passed
in URL query strings, wrapped in **unsigned base64 "tickets"**, and stored in **localStorage**.
There is no server-mediated silent SSO and no account chooser wired to OAuth.

The single hardest constraint is domain topology: QuantMail is served from `quantmail.in`
while the other apps are `*.quantrinity.in` (and `quant.network` also appears in allowlists).
A single shared cookie **cannot** span those registrable domains, so the unifying decision
is not cosmetic — it is architectural (see Section 12, the one decision the owner must make).

## 2. Assumptions (I cannot ask questions; these are stated, not verified with the owner)

- A1. Target is production `*.quantrinity.in` for 9 apps + `quantmail.in` for QuantMail,
  matching `CORE_QUANT_APPS` (`packages/shared-ui/src/interconnection/constants.ts:10`).
- A2. ADR-002 (QuantMail = Auth Root) and ADR-004 (extract standalone identity-service) remain
  the accepted direction; this design is the concrete path between them.
- A3. Live staging must not break during rollout (explicit task constraint).
- A4. "Google-class" = OIDC Authorization Code + PKCE with a central identity origin, not the
  current token-in-URL handoff.
- A5. Existing Prisma user store in `@quant/auth` is the system of record for accounts.
## 3. Current-state assessment (verified against source)

### 3.1 There are THREE coexisting, contradictory client session models

- Model A — QuantMail app (secure, per-app): access token lives in module memory only, the
  refresh token is an HttpOnly cookie, session is restored via `/auth/refresh`, and the app
  actively purges legacy localStorage tokens.
  Evidence: `apps/quantmail/src/services/browser-auth-session.ts` (memory `let accessToken`,
  `cleanupLegacyBrowserTokens`); `apps/quantmail/src/providers/auth-provider.tsx` (12-min
  rotation, 2FA challenge flow).
- Model B — shared-ui `useAuth` (used by QuantChat): stores the token in **localStorage**
  (`quant_access_token` / `quant_refresh_token`) and verifies it against `/api/auth/userinfo`.
  Evidence: `packages/shared-ui/src/hooks/useAuth.ts:73` (keys), `:96` (consumes handoff
  ticket), `:222` (`fetchUserFromToken`, fail-closed). Verification is correct; **storage is
  XSS-exposed.**
- Model C — QuantAI app (hybrid): consumes SSO ticket + URL token params, then keeps a token in
  memory but falls back to a localStorage/cookie token, plus its own 12-min refresh.
  Evidence: `apps/quantai/src/services/auth-session.ts:24` (memory), `:26-28` (falls back to
  `getAuthToken()`), `:41-44` (`ingestSSOToken` writes localStorage via `setAuthToken`);
  `apps/quantai/src/providers/auth-provider.tsx:44-67`.

These models actively fight each other: QuantMail purges the very localStorage keys that the
shared bridge and QuantChat write.

### 3.2 A real, secure OAuth2/OIDC provider EXISTS — but is unused for cross-app SSO

- Full DB-backed OIDC on QuantMail backend: `/oauth/authorize`, `/oauth/token` (auth-code +
  refresh, confidential-client secret check, PKCE enforcement, single-use code, RS256
  `id_token`), `/oauth/userinfo`, discovery, `/.well-known/jwks.json`.
  Evidence: `apps/quantmail/backend/routes/oauth.ts` (`getIssuer()` `:13`, TokenService config
  `:28-38`, `ACCESS_TOKEN_TTL_SECONDS = 900` `:22`).
- Secure cookie browser session: `apps/quantmail/backend/routes/auth.ts` (`/auth/login` with
  rate-limit + trusted-origin + argon2 + 2FA branch, `/auth/refresh` cookie-only rotation,
  `/auth/logout` family revocation).
- **None of the other apps drive these OAuth endpoints.** The `/sso` page does not run an
  OAuth authorize; it hands the raw token over the URL (Section 3.3).
### 3.3 What is ACTUALLY live cross-app: insecure token-in-URL + unsigned tickets

- `UniversalSSOTokenBridge` is the live mechanism. It stores the token in localStorage
  (`quant_access_token` / `quant_auth_token`), and its "handoff ticket" is **`btoa(JSON)`
  base64url — not signed, not encrypted** — with `verifyHandoffTicket` doing a plain base64
  decode and trusting a client-supplied `exp`. Any party can forge a ticket with an arbitrary
  `uid`/`email`/`tier` for UI purposes.
  Evidence: `packages/shared-ui/src/interconnection/UniversalSSOTokenBridge.ts` (localStorage
  `:209-210`, `generateHandoffTicket` `:230-257`, `verifyHandoffTicket` `:262-285`,
  `consumeHandoffTicket` reads `__quant_sso_ticket`/`token`/`accessToken` from URL `:292-364`).
- The QuantMail `/sso` "account chooser" appends the token to the destination URL as `token`,
  `accessToken`, `refreshToken`, and `__quant_sso_ticket`, and **mislabels the access token as
  the refresh token**. Accounts are a plain localStorage list. It never runs OAuth.
  Evidence: `apps/quantmail/src/app/sso/page.tsx:133-145` (URL params), `:138` (refresh = access
  bug), `:33` (`quant_known_accounts`), `:228` (hardcoded `#090A0C`, not brand tokens).
- Receiving apps ingest the URL token and persist it. QuantChat writes the token to **five**
  localStorage keys and reuses it as the refresh token.
  Evidence: `apps/quantchat/src/lib/auth-session.ts:32-43` (`persistSession` → 5 keys),
  `apps/quantchat/src/providers/auth-gate.tsx:49` (`persistSession(resolvedToken, refreshToken
  || resolvedToken)`).

Token-in-URL leaks via browser history, `Referer`, server/proxy logs, and shared links; the
access token doubling as the refresh token defeats rotation entirely.

### 3.4 The backend verifier itself accepts tokens from the URL

The shared Fastify auth plugin (used by app backends) accepts the bearer from the
`Authorization` header, the `quant_access_token` cookie, **or the `?token=` query string**, and
verifies with a **symmetric HS256 shared secret** against an issuer/audience allowlist.
Evidence: `packages/server-core/src/plugins/auth.ts:21` (symmetric secret), header `:29-32`,
cookie `:35-47`, query `?token=` `:49-59` (and `optionalAuth` `:160-170`), issuer allowlist
`[jwtIssuer, 'quantmail', 'https://quantrinity.in', 'https://quant.app']` `:73`, audience
`[jwtAudience, 'quant-ecosystem']` `:74`. Scope checks are backed by RBAC
(`packages/server-core/src/plugins/identity-permissions.ts:30-37`, depends on `auth` `:41`).

Two consequences: (a) the server is the enabler of the URL-token handoff (it will accept it);
(b) a single shared symmetric secret means any app that can *verify* can also *mint* — a
compromise of one app compromises the identity of all. Target must move to asymmetric RS256 +
JWKS (already half-present: `oauth.ts` issues RS256 `id_token` and serves `jwks.json`).

### 3.5 The cross-subdomain blocker (root cause of the complaint)

QuantMail's refresh cookie is **host-only** (no `Domain`), `Path=/auth`, `SameSite=Strict`, so
it cannot be presented to any other host or app.
Evidence: `apps/quantmail/backend/lib/auth-session.ts` (`REFRESH_COOKIE_NAME 'quantmail_refresh'`
`:16`, `REFRESH_COOKIE_PATH '/auth'` `:17`, options `httpOnly/secure/sameSite:'strict'/path`
`:20-26`). Combined with the fact that there is no silent OAuth authorize, a login in one app
simply does not exist in another — exactly the owner's complaint.
### 3.6 Identity data model that exists today

- Prisma-backed OAuth entities in `@quant/auth` (`oAuthClient`, `authorizationCode`,
  `oAuthConsent`, `refreshToken`, `user`) and a Prisma-backed, KMS-resolved `TokenService`
  (HS256 access/refresh with `kid`; refresh rotation with compare-and-set reuse detection that
  revokes the whole family; plus RS256 JWKS methods).
  Evidence: `packages/auth/src/services/token-service.ts` (KMS `:45-51`, mint `:95-166`,
  rotation/reuse `:168-253`, JWKS `:281-295`).
- Shared types already model the target: `User`, `Session` (with `deviceInfo`),
  `OAuthTokenResponse`, `OAuthAuthorizationRequest` (with `codeChallenge`/`codeChallengeMethod`),
  `PermissionScope` (30 scopes incl. `openid`/`profile`/`email`), and `AppGrant` (per-app
  scopes). Evidence: `packages/common/src/types.ts` (`User` `:20`, `Session` `:36`,
  `OAuthTokenResponse` `:172`, `OAuthAuthorizationRequest` `:182`, `PermissionScope` `:303-334`,
  `AppGrant` `:393`). The client session shape `QuantUserSession` (with `tier`, `activeSessions`)
  is in `packages/shared-ui/src/interconnection/types.ts:44`.
- **Gap:** `SessionService` in `@quant/auth` is **fully in-memory (Maps)** — sessions do not
  survive restart or span instances (from prior read: `session-service.ts:30-38`). And a second,
  divergent in-memory OAuth provider exists (`packages/auth/src/providers/quantmail-provider.ts`)
  with `*.quant.app` redirect URIs and a placeholder user on code exchange — legacy/test, must
  not be the production path.

### 3.7 Confirmed inconsistencies / bugs to resolve (not invented — cited)

1. Three issuer identities: HS256 access tokens use `iss='quantmail'` / `aud='quant-ecosystem'`
   (`oauth.ts:33-34`); the OIDC `id_token`/discovery use `iss='https://quantmail.com'`
   (`oauth.ts:13-15`); ADR-002 mandates `https://quant.app` / `quant-platform`. The verifier
   masks this with a 4-issuer allowlist (`auth.ts:73`) — correctness by permissiveness.
2. Access token passed and accepted in URLs (`sso/page.tsx:133-145`, `auth.ts:49-59`).
3. Unsigned base64 handoff tickets (`UniversalSSOTokenBridge.ts:230-285`).
4. Access token stored as refresh token (`sso/page.tsx:138`, `quantchat auth-session:56`,
   `auth-gate.tsx:49`).
5. Tokens in localStorage across shared-ui + QuantChat + QuantAI (Section 3.1).
6. In-memory `SessionService` (no persistence / no multi-instance).
7. Symmetric HS256 shared secret enabling cross-app minting (`auth.ts:21`).
8. Reusable-but-unused shared-ui `LoginPage` (hardcoded `from-blue-600...` gradient, broken
   `✉` emoji) and `ConsentScreen` (unused by the raw-HTML `/oauth/authorize`).
9. Each app still ships its own login page (quantchat, quantai, quantube, quantmax, quantneon,
   quantsync, quantads, quantmail) — no single sign-in surface.
## 4. Target architecture

### 4.1 Principles

- P1. One identity origin is authoritative. Per ADR-002 QuantMail is Auth Root today; per
  ADR-004 identity becomes a standalone service. This design introduces a stable identity
  ORIGIN now so the eventual service swap is invisible to apps.
- P2. Apps never see credentials and never mint tokens. They receive a verified identity via
  OIDC only.
- P3. Access token in memory; refresh only in an HttpOnly, `Secure`, `SameSite` cookie scoped to
  the identity origin. No tokens in URLs, no tokens in localStorage.
- P4. Asymmetric signing (RS256/EdDSA) + published JWKS. Apps verify by public key; only the
  identity origin holds the private key. One issuer, one audience policy.
- P5. Everything reuses what already works: the DB-backed OAuth/OIDC on QuantMail backend, the
  Prisma user store, `TokenService` rotation+reuse detection, shared-ui components, brand tokens.

### 4.2 The identity origin

Introduce a single sign-in origin, referred to here as the Quant Account origin:

- Recommended host: `id.quantrinity.in` (a dedicated subdomain), fronting the existing
  QuantMail OAuth/OIDC backend unchanged initially, then the ADR-004 `services/identity`.
- It owns: the login UI, the account chooser, the consent screen, the OAuth `/authorize` +
  `/token` + `/userinfo` + discovery + JWKS, and the **identity session cookie** (the "am I
  logged in to Quant?" cookie), which is HttpOnly and scoped to the identity origin only.
- Why a dedicated origin (not `mail.` reused): it cleanly decouples "Quant Account" from the
  QuantMail product (ADR-004 Law 1: "Identity exists before any app"), and it is the only design
  that works across the three registrable domains in play (`quantrinity.in`, `quantmail.in`,
  `quant.network`).

### 4.3 Token & session strategy

- Identity session cookie (at `id.quantrinity.in`): HttpOnly, Secure, `SameSite=None` (needed so
  it is sent on the silent-authorize iframe/redirect from other origins), short-lived server
  session id → server-side session record (replaces the in-memory `SessionService` with a
  persisted store; fixes 3.6 gap).
- Per-app access token: JWT, ~15 min TTL (matches `ACCESS_TOKEN_TTL_SECONDS = 900`,
  `oauth.ts:22`), audience = the requesting app, held in memory (Model A pattern, already proven
  in `apps/quantmail/src/providers/auth-provider.tsx`).
- Per-app refresh token: HttpOnly `Secure` `SameSite=Strict` cookie scoped to that app's own
  origin/path (the QuantMail pattern generalised), rotated with reuse detection
  (`token-service.ts:168-253`). The refresh cookie never leaves its app; the identity cookie
  never leaves the identity origin. These are different cookies with different jobs.
## 5. OIDC flows (the mechanics behind "Google-class")

### 5.1 First login (interactive Authorization Code + PKCE)

1. App (e.g. `quantchat.quantrinity.in`) has no session → redirects to
   `https://id.quantrinity.in/authorize?client_id=quantchat&redirect_uri=...&response_type=code&
   scope=openid profile email ...&state=<csrf>&code_challenge=<S256>&code_challenge_method=S256`.
2. Identity origin has no identity cookie → renders the shared login UI, authenticates against
   the existing `/auth/login` (argon2, rate-limit, trusted-origin, 2FA branch already in
   `apps/quantmail/backend/routes/auth.ts`), sets the identity session cookie, then shows the
   consent screen if this client/scope set is not yet consented.
3. Redirect back to the app's `redirect_uri` with `?code=...&state=...` (single-use code, already
   implemented in `oauth.ts /oauth/token`).
4. App backend exchanges code + `code_verifier` at `/token` → receives access token (+ id_token)
   and sets its own HttpOnly refresh cookie. Access token stays in app memory.

`state` is verified for CSRF; PKCE S256 is enforced (`validateCodeChallenge` in `@quant/auth`).

### 5.2 Silent SSO (the "already signed in everywhere" property)

When another app loads and has no local session, it performs a **silent authorize**:
`/authorize?...&prompt=none` inside a hidden iframe (or a fast top-level redirect).

- If the identity cookie is present at `id.quantrinity.in`, the identity origin returns a code
  with no UI → app exchanges it → user is signed in with zero interaction.
- If not, it returns `error=login_required` → the app shows a sign-in affordance (no infinite
  loop). This is exactly how Google keeps every property signed in, and it is the piece that
  does not exist today.

### 5.3 Refresh & rotation

Per-app refresh uses the existing rotating refresh with reuse detection
(`token-service.ts:168-253`): each use issues a new refresh, invalidates the prior one, and a
replay of an old refresh revokes the entire family. Access tokens are re-minted every ~12 min
(the cadence already used in `apps/quantmail/src/providers/auth-provider.tsx`) or on demand.

## 6. Account chooser & multi-account (Google-style)

- The identity origin maintains a list of **authenticated** accounts server-side (multiple
  identity sessions in one browser, keyed in the identity cookie), NOT a plaintext localStorage
  list (replacing `quant_known_accounts`, `sso/page.tsx:33`).
- `/authorize` supports `prompt=select_account` → always shows the chooser; `login_hint=<sub>`
  → pre-selects an account. Choosing an account mints the code for THAT identity.
- "Use another account" runs an interactive login and adds a second identity session to the same
  browser without dropping the first (Google's exact behaviour).
- The chooser UI is the existing `/sso` visual design, re-pointed to real OAuth (no token in the
  URL, no localStorage account list).

## 7. Logout & device/session management

- Single-app logout: clears that app's refresh cookie + memory token (existing `/auth/logout`
  family revocation, `apps/quantmail/backend/routes/auth.ts`).
- Global "sign out of all": clears the identity session server-side and revokes all per-app
  refresh-token families for that identity (generalises `SSOMiddleware.propagateLogout`,
  `packages/auth/src/middleware/sso-middleware.ts:183-199`). OIDC front-channel/back-channel
  logout notifies each app origin.
- Device/session list: backed by the persisted session store (`Session.deviceInfo` already
  modelled, `packages/common/src/types.ts:36-54`) — "signed in on N devices", revoke one.
## 8. Component list (reuse first; build only the gaps)

Reuse as-is (or lightly):
- `apps/quantmail/backend/routes/oauth.ts` — the OAuth/OIDC engine. Keep; move behind the
  identity origin.
- `apps/quantmail/backend/routes/auth.ts` + `lib/auth-session.ts` — credential login, 2FA,
  refresh rotation, trusted-origin.
- `packages/auth` `TokenService` (rotation/reuse/JWKS), Prisma OAuth entities, PKCE, WebAuthn,
  `SSOMiddleware` (for `propagateLogout`).
- `packages/shared-ui` `useAuth` (`hooks/useAuth.ts`) — keep the userinfo verification; **change
  storage from localStorage to memory + silent-authorize** (see 3.1 Model A).
- `packages/shared-ui` `LoginPage` + `ConsentScreen` — adopt as the identity-origin UI after
  fixing brand-token theming and the broken emoji.
- `packages/brand` — `generateThemeCSS` and the 6 themes `dark/light/neon/bharat/highContrast/
  colorblindSafe` (`packages/brand/src/index.ts:52`) become the token source for all auth UI.

Build (the gaps):
- Identity origin app/route surface at `id.quantrinity.in` (host + routing; can start as a thin
  Next.js surface in front of the existing backend).
- `prompt=none` silent-authorize handling on `/authorize` and a client-side silent-auth helper
  in `@quant/shared-ui` (hidden iframe + postMessage, origin-checked via existing
  `SAFE_DOMAIN_PATTERNS`, `interconnection/constants.ts:179`).
- Persisted `SessionService` (DB-backed) replacing the in-memory Maps.
- A single OIDC client helper package (proposed `@quant/auth-client` / ADR-004 `IdentityClient`)
  that every app uses instead of bespoke providers.
- Signed logout channel (OIDC back-channel logout) to replace `performGlobalLogout`'s
  localStorage-clear (`UniversalSSOTokenBridge.ts:579-614`).

Retire (after migration):
- Token-in-URL handoff and unsigned tickets (`UniversalSSOTokenBridge` handoff path,
  `sso/page.tsx` URL params), localStorage token persistence, the `?token=` query acceptance in
  `packages/server-core/src/plugins/auth.ts:49-59`, and the divergent in-memory
  `quantmail-provider.ts`.

## 9. How each app delegates auth to the root

Every app follows one contract (via the shared OIDC client helper):
1. On load, try silent-authorize (`prompt=none`) against `id.quantrinity.in`.
2. On `login_required`, redirect (or show a button) to interactive `/authorize`.
3. Exchange code at the app's backend; set the app's own HttpOnly refresh cookie; keep the
   access token in memory.
4. Verify/refresh via `/api/auth/userinfo` (already the shared-ui contract,
   `hooks/useAuth.ts:55-60`, `:222`).

Per-app notes (from `CORE_QUANT_APPS`, `interconnection/constants.ts:10-159`):
- QuantMail (`quantmail.in`) — hosts/So is adjacent to the identity origin; becomes just another
  OIDC client of `id.quantrinity.in` (ADR-004 removes its special status). Its existing secure
  provider is the reference implementation to generalise.
- QuantChat (`chat.`) — replace `useAuth` localStorage + `persistSession` 5-key writes with the
  OIDC client; `auth-gate.tsx` keeps its fail-closed redirect.
- QuantAI (`ai.`) — collapse the hybrid Model C into the standard client.
- QuantGram, Quantube, QuantWave, QuantMax, QuantCooks, QuantAds, QuantTrinity — each adds the
  standard client + a code-exchange backend route; delete bespoke login pages.
- Cross-registrable-domain reality: because `quantmail.in` and `quant.network` are NOT
  `*.quantrinity.in`, they cannot share a `.quantrinity.in` cookie — they MUST use silent
  authorize (Section 12).
## 10. UI/UX (on @quant/shared-ui + @quant/brand tokens)

All auth surfaces live at the identity origin and are themed by brand tokens (not hardcoded
hex). Three screens:

- Sign-in: adapt `packages/shared-ui/src/components/Auth/LoginPage.tsx`. Fixes required: replace
  the hardcoded `from-blue-600 via-purple-600 to-pink-500` gradient (`:73`) with
  `generateThemeCSS` variables (`packages/brand`); fix the broken `✉` emoji literal (`:130`);
  keep the credential + social-stub structure; add the requesting app's name/icon from
  `CORE_QUANT_APPS`.
- Account chooser: adapt the `/sso` layout (`apps/quantmail/src/app/sso/page.tsx`) — keep the
  Google-class visual (avatars, "Signed in", "Use another account") but drive it from real
  server-side account state and OAuth, and re-theme `#090A0C`/`#FF8C42` (`:228`) to brand tokens.
- Consent: use `packages/shared-ui/src/components/Auth/ConsentScreen.tsx` (currently unused by
  the raw-HTML `/oauth/authorize`) with `permissions` derived from `PermissionScope`
  (`packages/common/src/types.ts:303-334`) and `AppGrant` (`:393`); render inside `/authorize`.

All three inherit the 6 themes and pass the existing contrast checks (`packages/brand` `meetsAA`).

## 11. Data flow (end to end)

First interactive login (app has nothing):
```
app → 302 /authorize(PKCE,state) → id.quantrinity.in
   no identity cookie → LoginPage → /auth/login (argon2, 2FA?) → set identity cookie
   → ConsentScreen (if needed) → 302 app/redirect_uri?code&state
app backend → POST /token(code, code_verifier) → {access, id_token}; Set-Cookie app refresh
app → access token in memory → GET /api/auth/userinfo (verify) → render
```

Silent SSO (second app, identity cookie already set):
```
app2 (hidden iframe) → /authorize?prompt=none → id.quantrinity.in
   identity cookie present → 302 code (no UI) → postMessage code to app2
app2 backend → /token → signed in, zero clicks
   (else error=login_required → show sign-in button)
```

Account switch:
```
chooser → /authorize?prompt=select_account (or login_hint=<sub>) → code for chosen identity
```

Global logout:
```
any app → id.quantrinity.in/logout → destroy identity session
   → revoke all per-app refresh families (propagateLogout)
   → OIDC back-channel logout ping to each app origin → local cookies cleared
```

Refresh rotation (per app, ongoing):
```
~12 min timer OR 401 → app backend /auth/refresh (cookie) → new access (+rotated refresh)
   replay of old refresh → whole family revoked (reuse detection)
```
## 12. THE decision the owner must make (session topology)

How does "signed in everywhere" physically work? Two options; they are mutually exclusive as the
primary mechanism.

- Option A — Shared cross-subdomain cookie on `Domain=.quantrinity.in`. Simple: one cookie is
  visible to every `*.quantrinity.in` app. BUT it **cannot** cover `quantmail.in` or
  `quant.network` (different registrable domains, present in `interconnection/constants.ts:8`,
  `:181-183` and `safe-return-path.ts:15-22`). It also loosens isolation (every subdomain sees
  the cookie) and does nothing for native/mobile later.
- Option B — Central identity-origin session + silent OAuth `/authorize?prompt=none`
  (RECOMMENDED). The identity cookie lives only at `id.quantrinity.in`; each app obtains its own
  token by silent authorize. Works across ALL registrable domains, keeps per-app isolation, is
  the real Google model, and is exactly ADR-004's `IdentityClient` direction. Cost: build the
  silent-authorize iframe/redirect flow and stand up the identity origin.

Recommendation: **Option B.** The domain topology (QuantMail on `quantmail.in`, not a
`quantrinity.in` subdomain) means Option A cannot satisfy the owner's "one login across ALL
apps" without also moving QuantMail onto a `quantrinity.in` subdomain — a bigger, user-visible
change. Option B is the only design that unifies the domains as they exist today.

This is the one call that changes everything downstream, so it needs the owner's explicit
ratification before build starts.

## 13. Security design

- CSRF: OAuth `state` on every authorize; `SameSite` on cookies; the existing
  `requireTrustedOrigin` Origin allowlist (`apps/quantmail/backend/lib/auth-session.ts:58-62`)
  extended to the identity origin.
- PKCE: S256 mandatory for all clients (public and confidential); reject `plain`.
- Refresh rotation + reuse detection: keep `token-service.ts:168-253`; never expose refresh to
  JS; never put it in a URL; stop reusing access-as-refresh (fixes 3.7 #4).
- Cookie flags: identity cookie `HttpOnly; Secure; SameSite=None` (cross-origin silent auth);
  per-app refresh `HttpOnly; Secure; SameSite=Strict; Path=/auth`; access token never in a
  cookie readable by JS and never in localStorage.
- Signing keys: migrate access tokens to RS256/EdDSA with published JWKS + `kid` rotation
  (`token-service.ts:281-295` + `jwks.json` already exist); retire the shared HS256 secret
  (`server-core/src/plugins/auth.ts:21`) so apps can only verify, never mint.
- Issuer/audience unification: pick ONE issuer (recommend `https://id.quantrinity.in`) and a
  per-app audience; collapse the 4-issuer allowlist (`auth.ts:73`) and reconcile the
  `https://quantmail.com` vs `quantmail` vs `https://quant.app` split (3.7 #1).
- Token replay / URL leakage: remove `?token=` acceptance (`auth.ts:49-59, 160-170`) and all
  URL token params (`sso/page.tsx:133-145`); codes are single-use + short-TTL + PKCE-bound.
- Handoff integrity: if any ticket remains transitional, it MUST be a signed JWT (JWS), never
  `btoa(JSON)` (`UniversalSSOTokenBridge.ts:230-285`).
- postMessage: restrict silent-auth `postMessage` targetOrigin to `SAFE_DOMAIN_PATTERNS`
  (`interconnection/constants.ts:179`); never `*`.
- Open redirect: keep `safeReturnPath` allowlist (`apps/quantmail/src/lib/safe-return-path.ts`)
  on every `redirect_uri`/`returnTo`.
## 14. Error handling

- Silent auth `login_required`: no loop — surface a sign-in button; never auto-redirect more
  than once (guard with a one-shot flag in the client helper).
- Backend unreachable during verify: fail CLOSED with 502 (the pattern just hardened in
  QuantChat userinfo — recent commits `c922642c`, `706114d4`), never fabricate a user
  (`hooks/useAuth.ts` already throws on non-ok).
- Invalid/expired access token: 401 → attempt refresh once → if refresh fails, clear session and
  re-run silent auth.
- Refresh reuse detected: revoke family, force full re-login, log a security event.
- Consent denied: return `access_denied` to the app, which shows a friendly "permission needed"
  state.
- 2FA required: identity origin renders the challenge step (existing challenge/`completeTwoFactor`
  flow) before issuing a code.
- Code exchange failure (bad `code_verifier`, reused code, redirect mismatch): 400 invalid_grant;
  app restarts authorize.
- Clock skew: allow small `leeway` on `jwtVerify` (already using `jose`).

## 15. Testing strategy

- Unit: PKCE S256 verify; state/nonce validation; `safeReturnPath` allowlist (extend existing
  tests); refresh rotation + reuse-detection family revocation; scope subsumption
  (`evaluateScopes`).
- Contract: OIDC discovery + JWKS shape; `/authorize`, `/token`, `/userinfo` responses;
  `id_token` claims (iss/aud/nonce). One issuer/audience asserted end to end (regression against
  3.7 #1).
- Integration: full interactive login; silent-authorize success and `login_required`; account
  switch (`prompt=select_account`); global logout revokes every app; refresh rotation across a
  restart (proves the persisted SessionService, 3.6 gap).
- Cross-domain E2E (Playwright): sign in on `chat.quantrinity.in`, load `quantmail.in` and
  `ai.quantrinity.in` → both silently authenticated without re-typing. This is the literal test
  of the owner's complaint.
- Security: assert access tokens are NOT in localStorage and NOT in any URL (guards against
  regressions of 3.7 #2/#5); assert `?token=` no longer authenticates once removed; verify
  back-channel logout clears each origin; negative test that a forged unsigned ticket is
  rejected.
- Migration safety: run legacy handoff and new OIDC side by side behind a flag; snapshot that
  live staging keeps working at each phase boundary.
## 16. Migration path (non-breaking on live staging)

The two systems (legacy handoff, new OIDC) run in parallel behind a feature flag; apps flip one
at a time. No big-bang cutover.

- Phase 0 — Foundations (no user-visible change): stand up `id.quantrinity.in` in front of the
  existing QuantMail OAuth backend; register OAuth clients for all 10 apps (replace the
  `*.quant.app` URIs from `quantmail-provider.ts` with real `*.quantrinity.in`/`quantmail.in`
  redirect URIs in the DB-backed provider); publish JWKS; persist `SessionService`.
- Phase 1 — Unify issuer/audience + keys: converge on one issuer + per-app audience; add RS256
  verification alongside HS256 in `server-core` auth (accept both during transition), then drop
  HS256. Keeps the 4-issuer allowlist working until the last token rotates out.
- Phase 2 — Ship the OIDC client helper + silent authorize: land `@quant/auth-client`; wire it in
  QuantMail first (lowest risk, it already owns the backend), behind a flag.
- Phase 3 — Migrate readers app-by-app: QuantChat, then QuantAI, then the rest. Each app: add
  code-exchange route, switch `useAuth`/provider from localStorage to memory + silent auth,
  delete its bespoke login page. Legacy handoff still accepted for not-yet-migrated apps.
- Phase 4 — Turn off legacy: remove `?token=` acceptance (`auth.ts:49-59`), URL token params
  (`sso/page.tsx`), unsigned tickets, and localStorage token writes. Retire
  `quantmail-provider.ts`.
- Phase 5 — ADR-004 completion: swap the identity origin's backing from QuantMail to
  `services/identity` with no app change (apps already talk only OIDC).

Rollback: because both systems co-exist until Phase 4, flipping an app's flag back to legacy is
the rollback at every step before then.

## 17. Open decisions (owner)

1. **Session topology — Option A shared cookie vs Option B central identity origin + silent
   authorize.** THE decision. Recommendation: Option B (Section 12). Everything else depends on
   it.
2. Identity origin host: `id.quantrinity.in` (recommended) vs reuse `mail.`/`accounts.`.
3. Whether to move QuantMail onto a `quantrinity.in` subdomain (only relevant if Option A is
   chosen; not needed for Option B).
4. Canonical issuer string (recommend `https://id.quantrinity.in`) and signing algorithm
   (RS256 vs EdDSA).
5. Timeline for ADR-004 service extraction (Phase 5) vs staying on the QuantMail-backed origin.

## 18. Evidence index (primary citations)

- Domain topology / app registry: `packages/shared-ui/src/interconnection/constants.ts:7-8`,
  `:10-159`, `:164-188`.
- Live insecure handoff: `packages/shared-ui/src/interconnection/UniversalSSOTokenBridge.ts`
  `:209-210`, `:230-285`, `:292-364`, `:579-614`; `apps/quantmail/src/app/sso/page.tsx:33`,
  `:133-145`, `:138`, `:228`.
- Backend verify + URL token: `packages/server-core/src/plugins/auth.ts:21`, `:29-59`, `:73-89`,
  `:160-170`; `packages/server-core/src/plugins/identity-permissions.ts:30-41`.
- Real OAuth/OIDC + cookie session: `apps/quantmail/backend/routes/oauth.ts:13-38`;
  `apps/quantmail/backend/routes/auth.ts`; `apps/quantmail/backend/lib/auth-session.ts:16-26`,
  `:58-62`.
- Client session models: `packages/shared-ui/src/hooks/useAuth.ts:55-60`, `:73-74`, `:96-105`,
  `:222-246`; `apps/quantai/src/services/auth-session.ts:24-44`, `:86-98`;
  `apps/quantchat/src/lib/auth-session.ts:19-59`; `apps/quantchat/src/providers/auth-gate.tsx:49`.
- Data model + tokens: `packages/common/src/types.ts:20-54`, `:172-191`, `:303-334`, `:393`;
  `packages/auth/src/services/token-service.ts:45-51`, `:95-166`, `:168-253`, `:281-295`.
- UI + brand: `packages/shared-ui/src/index.ts:145-148`, `:372-373`;
  `packages/shared-ui/src/components/Auth/{LoginPage,ConsentScreen}.tsx`;
  `packages/brand/src/index.ts:51-52`.
- Direction: `docs/adr/002-identity-first-architecture.md`, `docs/adr/004-identity-independent-of-product.md`.
