# Security, Authentication, and Trust

## Original browser-session problem

- `quant_auth_tokens` stored access and refresh credentials in localStorage.
- Login/register returned refresh tokens in JSON.
- Browser JavaScript could read the long-lived credential.
- Logout could clear local state while server revocation failed.
- UI could imply session/connected-app inventory without a verified backend contract.

## Merged server invariant — PR #125

Merged as `a5f2057887e1842368af4baaf65192c16b5f1c14`:

- SHA-256 refresh digest persistence;
- issuer/audience and required-claim validation;
- stored credential, user, and family binding checks;
- atomic compare-and-set rotation;
- concurrent-loser/reuse family revocation.

## Merged browser boundary — PR #132

Merged as `09a0a22e9aa5fe288d22987b90a6119a70f7c467`:

- refresh token omitted from login/register JSON;
- host-only HttpOnly cookie named `quantmail_refresh`;
- `Secure` in production, `SameSite=Strict`, `/auth` path, 30-day maximum age;
- exact configured Origin required before login/register/refresh/logout credential work;
- cookie-only refresh and complete-family logout revocation;
- same-origin auth/profile proxies;
- memory-only short-lived access token;
- cleanup of `quant_auth_tokens`, `quant_access_token`, `quant_refresh_token`, `token`, and `refreshToken`;
- one in-flight refresh and one bounded retry;
- shared credentialed Email/Git/Drive transport;
- standards-compatible non-browser `/oauth/token` behavior.

## Definitive evidence

- Gate, dependency audit, memory/PostgreSQL, QuantChat coverage, immutable pins, and all CodeQL analyses passed.
- Current backend and focused changed-boundary frontend typechecks passed.
- Refresh-family, OAuth compatibility, cookie, proxy, session, transport, cleanup, registration, retry, and real Chromium acceptance passed.
- Base and current full frontend typechecks had the exact same inherited annotations.
- Temporary repair workflows were removed before merge.

## Inherited debt and deployment boundary

The full QuantMail frontend still reports a missing `@quant/agentic/voice-commands` declaration and implicit-`any` parameters `entry`, `index`, and `result`. This debt is not hidden and must be fixed separately.

Merged code is not deployed proof. Issue #120 must remain open until the real production hostname, TLS, exact origins, proxy/cookie behavior, logout/family revocation, monitoring, and rollback are verified through the deployed path.

## Trust rules

- Never claim focused green lanes prove aggregate readiness.
- Never weaken security, audit, Origin, cookie, token-family, or retry controls for CI.
- Never expose bearer values in logs, URLs, analytics, crash reports, issue comments, or memory docs.
- Do not deploy stale domains, account IDs, origins, or mutable image tags.
- Do not describe a local sign-out as verified server revocation.
