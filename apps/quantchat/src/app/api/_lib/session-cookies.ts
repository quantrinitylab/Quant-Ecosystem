import { NextRequest, NextResponse } from 'next/server';
import { authCookieSecure } from './cookie-options';

/**
 * QC-F-154 (Slice-1 / Release A) — HttpOnly-cookie-canonical session: server foundation.
 *
 * Today the web session runs on JS-readable tokens: `persistSession()`
 * (src/lib/auth-session.ts) writes the access token under FIVE localStorage
 * keys plus a 30-day refresh token under a sixth (`quant_refresh_token`),
 * and apiClient / hand-rolled `fetch` callers send them as
 * `Authorization: Bearer` headers. Any XSS in the app steals the session
 * outright; the HttpOnly cookies that incidentally exist (userinfo/proxy
 * transparent-exchange paths, refresh mirror) have no maxAge, are never read
 * back, and the shared proxy never forwards them to the backend — the
 * backend auth plugin's cookie support is dead plumbing for web traffic.
 *
 * This module is the ONE place session cookies are set, read and expired, so
 * the flags can never drift between writers (the QC-F-080 `Secure` lesson).
 *
 * Canonical store (both HttpOnly, never JS-readable):
 * - `quant_access_token` — 1h (backend access TTL), path '/'
 * - `quant_refresh_token` — 30d (backend refresh TTL), path '/api/auth'
 *   (refresh + logout only; it NEVER rides a data request)
 * A `token` mirror is written for one release (some logout/tests know it);
 * Release C of QC-F-154 removes it.
 *
 * Release-A scope (this slice): Next layer sets/reads/forwards the cookies
 * and the proxy synthesises the backend credential from them. The old
 * client keeps working — response bodies still carry the tokens, the
 * `Authorization` header path is still honoured. Release B (client stops
 * reading bodies / storing tokens) and Release C (body fields removed) are
 * owed follow-ups; this slice does NOT claim the finding is closed.
 */

export const ACCESS_COOKIE_NAME = 'quant_access_token';
export const REFRESH_COOKIE_NAME = 'quant_refresh_token';
/** One-release mirror of the access cookie; removed in Release C. */
export const LEGACY_COOKIE_NAME = 'token';

export const ACCESS_COOKIE_MAX_AGE = 60 * 60; // 1h
export const REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30d
/** The refresh cookie is path-scoped so it is only ever sent to the auth routes. */
export const REFRESH_COOKIE_PATH = '/api/auth';

function baseFlags() {
  return {
    httpOnly: true as const,
    // Secure on every deployed env (QC-F-080 shared helper); only local
    // dev/test skip it so http://localhost login keeps working.
    secure: authCookieSecure(),
    sameSite: 'lax' as const,
  };
}

/** Set the canonical session cookies on a Next response after a token issue. */
export function setSessionCookies(
  resp: NextResponse,
  tokens: { accessToken: string; refreshToken?: string },
): void {
  resp.cookies.set(ACCESS_COOKIE_NAME, tokens.accessToken, {
    ...baseFlags(),
    path: '/',
    maxAge: ACCESS_COOKIE_MAX_AGE,
  });
  resp.cookies.set(LEGACY_COOKIE_NAME, tokens.accessToken, {
    ...baseFlags(),
    path: '/',
    maxAge: ACCESS_COOKIE_MAX_AGE,
  });
  if (tokens.refreshToken) {
    resp.cookies.set(REFRESH_COOKIE_NAME, tokens.refreshToken, {
      ...baseFlags(),
      path: REFRESH_COOKIE_PATH,
      maxAge: REFRESH_COOKIE_MAX_AGE,
    });
  }
}

/**
 * Expire every session cookie. Deletion must match the set path, or the
 * browser keeps the cookie (QC-F-154 §3.1-6): the refresh cookie is expired
 * on its '/api/auth' path AND on '/' (in case an older writer set it there).
 */
export function clearSessionCookies(resp: NextResponse): void {
  const expire = { ...baseFlags(), maxAge: 0, expires: new Date(0) };
  resp.cookies.set(ACCESS_COOKIE_NAME, '', { ...expire, path: '/' });
  resp.cookies.set(LEGACY_COOKIE_NAME, '', { ...expire, path: '/' });
  resp.cookies.set(REFRESH_COOKIE_NAME, '', { ...expire, path: REFRESH_COOKIE_PATH });
  // Next's ResponseCookies keys by cookie NAME, so a second cookies.set for
  // the same name would silently drop the path-scoped expiry above. The '/'
  // copy (in case an older writer set the refresh cookie unscoped) is
  // therefore appended as a raw Set-Cookie header — both reach the browser.
  const flags = `Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; SameSite=Lax${
    authCookieSecure() ? '; Secure' : ''
  }`;
  resp.headers.append('Set-Cookie', `${REFRESH_COOKIE_NAME}=; ${flags}`);
}

function parseCookieHeader(header: string | null, name: string): string | null {
  if (!header) return null;
  const parts = header.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

/** Server-side cookie read (Next routes can read HttpOnly cookies — browser JS cannot). */
export function readCookie(request: Request | NextRequest, name: string): string | null {
  const viaNext = (request as NextRequest).cookies?.get(name)?.value;
  if (viaNext) return viaNext;
  return parseCookieHeader(request.headers.get('cookie'), name);
}

/**
 * Bearer credential for an incoming request: the `Authorization` header first
 * (old-client compat), then the HttpOnly access cookie. Never reads
 * localStorage — server-side code has no business there.
 */
export function getRequestBearerToken(request: Request | NextRequest): string | null {
  const header = request.headers.get('authorization');
  if (header && /^Bearer\s+/i.test(header)) {
    const token = header.replace(/^Bearer\s*/i, '').trim();
    if (token) return token;
  }
  return readCookie(request, ACCESS_COOKIE_NAME);
}

/**
 * Refresh credential: the HttpOnly refresh cookie first, then the legacy
 * body field (kept for one release so the old client — which stores the
 * refresh token in localStorage and POSTs it — keeps working).
 */
export function getRefreshCredential(
  request: Request | NextRequest,
  bodyRefreshToken: unknown,
): string | null {
  const fromCookie = readCookie(request, REFRESH_COOKIE_NAME);
  if (fromCookie) return fromCookie;
  return typeof bodyRefreshToken === 'string' && bodyRefreshToken.length >= 10
    ? bodyRefreshToken
    : null;
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Minimal CSRF guard for cookie-authenticated mutating requests.
 * `SameSite=Lax` already withholds the session cookie on cross-site POSTs;
 * this is the explicit second lock the QC-F-154 brief (§3.6) demands:
 * a mutating request that carries an Origin/Referer from another host is
 * rejected 403. Requests with NO Origin/Referer (curl, tests, server-side
 * fetch) are allowed — that is documented, not a hole, because a
 * cross-site attacker cannot suppress these headers.
 */
export function checkSameOrigin(request: Request | NextRequest): boolean {
  const method = (request.method || 'GET').toUpperCase();
  if (!MUTATING_METHODS.has(method)) return true;
  const origin = request.headers.get('origin') ?? request.headers.get('referer');
  if (!origin) return true;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const hostHeader = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  // The Host header is always present on a real server; fall back to the
  // request URL for programmatically constructed requests (tests).
  let host = hostHeader?.split(',')[0].trim() ?? null;
  if (!host) {
    try {
      host = new URL(request.url).host;
    } catch {
      return false; // cannot verify the target — fail closed
    }
  }
  return originHost.toLowerCase() === host.toLowerCase();
}

/** 403 response for a failed CSRF check — honest code, no fabricated session. */
export function csrfBlockedResponse(): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'CSRF_BLOCKED',
        message: 'Cross-origin request rejected',
      },
    },
    { status: 403 },
  );
}
