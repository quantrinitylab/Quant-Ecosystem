# Security, Authentication, and Trust

## Original browser-session problem

- `quant_auth_tokens` stored access and refresh credentials in localStorage.
- Login/register returned refresh tokens in JSON.
- Browser JavaScript could read the long-lived credential.
- Logout could clear local state while server revocation failed.
- UI could imply session/connected-app inventory without a verified backend contract.

## Required final contract

- Refresh credential inaccessible to JavaScript.
- One-way server persistence.
- Atomic rotation and family-wide reuse revocation.
- Exact-origin/CSRF protection appropriate to cookies.
- Memory-scoped short-lived access token.
- One bounded refresh and retry.
- Legacy browser token cleanup.
- Honest distinction between server logout and local sign-out.
- Standards-compatible non-browser OAuth.

## PR #125

Open implementation includes:

- SHA-256 digest persistence;
- issuer/audience and required-claim validation;
- stored credential, user, and family binding checks;
- compare-and-set rotation;
- concurrent loser/reuse family revocation.

Focused validation is green. Aggregate landing remains blocked.

## PR #130

Draft dependency remediation pins:

- `brace-expansion` `5.0.9`;
- `fast-uri` `3.1.5`;
- `undici` `7.29.0`;
- `postcss` `8.5.23`.

Moderate+ audit and CodeQL are green. Main gate and full sweep remain red. No advisory suppression, threshold reduction, or hand-edited lockfile is allowed.

## PR #132

Draft browser boundary includes:

- refresh token omitted from login/register JSON;
- host-only HttpOnly cookie named `quantmail_refresh`;
- `Secure` in production, `SameSite=Strict`, `/auth` path, 30-day max age;
- cookie-only refresh/logout and complete-family logout revocation;
- exact configured Origin before credential work;
- same-origin auth/profile proxies;
- memory-only access token;
- cleanup of `quant_auth_tokens`, `quant_access_token`, `quant_refresh_token`, `token`, and `refreshToken`;
- one in-flight refresh and one retry;
- shared authenticated Email/Git/Drive transport;
- non-browser `/oauth/token` compatibility;
- focused and real Chromium acceptance evidence.

It is still draft/non-mergeable because dependency audit, the main gate, full frontend typechecks, full sweep, review, and deployment alignment remain unresolved.

## Trust rules

- Never claim focused green lanes prove aggregate readiness.
- Never weaken security, audit, Origin, cookie, or retry controls for CI.
- Never expose bearer values in logs, URLs, analytics, crash reports, or memory docs.
- Do not deploy stale domains/accounts/origins.
- Do not close Issue #120 until merged and deployed behavior is verified.
