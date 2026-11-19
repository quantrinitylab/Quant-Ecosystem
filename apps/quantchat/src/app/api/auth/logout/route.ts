import { NextRequest, NextResponse } from 'next/server';
import {
  checkSameOrigin,
  clearSessionCookies,
  csrfBlockedResponse,
} from '../../_lib/session-cookies';

const BACKEND_URL =
  process.env.QUANTCHAT_BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://localhost:3002';

/**
 * POST /api/auth/logout — revoke the session server-side (best effort) and
 * expire the HttpOnly session cookies.
 *
 * WHY THIS EXISTS: the shared `useAuth` hook's logout() has always POSTed
 * here (its default `logoutUrl`), and the web apiClient's logout() posts to
 * the same path — but the route never existed, so the calls 404'd and the
 * server-set `quant_access_token` / `token` cookies (written by the
 * userinfo/proxy token-exchange paths) were NEVER cleared. Combined with a
 * stale localStorage alias key, a "signed-out" session silently came back
 * on the next page load / back-button.
 *
 * QC-F-118: sign-out now also revokes the refresh token's family on the
 * backend (POST /auth/logout, authenticated by the caller's access token,
 * which the client sends as Authorization). Before this, the refresh
 * token itself stayed redeemable for its full 30 days after "logout" —
 * only the local copies were discarded. The backend call is best-effort:
 * offline or backend-down, the cookies are still expired and the client
 * still clears locally, so a user who taps "Sign out" is signed out on
 * this device regardless. The flags mirror the writers (path '/',
 * HttpOnly, Secure via the shared QC-F-080 helper, Lax) so the browser
 * matches and deletes
 * the same cookies. Expired below: `quant_access_token` + `token`
 * (current writers) and `quant_refresh_token` (the cookie PR #861's SSO
 * callback/ticket routes set).
 *
 * QC-F-154 (Slice-1 / Release A): expiry goes through the canonical helper
 * so flags and PATHS always match the writers (the refresh cookie lives on
 * '/api/auth' — expiring it on '/' alone would leave it alive, QC-F-154
 * §3.1-6). This route expires session cookies, so foreign-origin POSTs are
 * rejected (CSRF, QC-F-154 §3.6).
 */
export async function POST(request: NextRequest) {
  if (!checkSameOrigin(request)) return csrfBlockedResponse();

  // Best-effort backend revocation. Body/headers are read defensively:
  // older callers POST with no body at all, and revocation must never be
  // what makes logout fail.
  if (request) {
    try {
      const body = (await request
        .json()
        .catch(() => null)) as { refreshToken?: unknown } | null;
      const refreshToken =
        typeof body?.refreshToken === 'string' ? body.refreshToken : null;
      const authorization = request.headers.get('authorization');
      if (refreshToken && authorization) {
        await fetch(`${BACKEND_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authorization,
          },
          body: JSON.stringify({ refreshToken }),
        }).catch(() => null);
      }
    } catch {
      // Logout proceeds to cookie expiry regardless.
    }
  }

  const nextResp = NextResponse.json({ success: true, data: { signedOut: true } });
  // Canonical expiry: matches the writers' flags AND paths (refresh cookie
  // expired on '/api/auth' as well as '/', QC-F-154 §3.1-6). Covers PR #861's
  // SSO callback/ticket `quant_refresh_token` cookie too — a no-op where it
  // was never set.
  clearSessionCookies(nextResp);
  return nextResp;
}
