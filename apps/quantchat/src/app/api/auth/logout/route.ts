import { NextResponse } from 'next/server';

/**
 * POST /api/auth/logout — expire the HttpOnly session cookies.
 *
 * WHY THIS EXISTS: the shared `useAuth` hook's logout() has always POSTed
 * here (its default `logoutUrl`), and the web apiClient's logout() posts to
 * the same path — but the route never existed, so the calls 404'd and the
 * server-set `quant_access_token` / `token` cookies (written by the
 * userinfo/proxy token-exchange paths) were NEVER cleared. Combined with a
 * stale localStorage alias key, a "signed-out" session silently came back
 * on the next page load / back-button.
 *
 * QuantChat session tokens are stateless JWTs, so there is no server-side
 * session row to revoke here; logout = the client discards its tokens
 * (localStorage + in-memory, see lib/auth-session `signOut()`) AND the
 * cookies are expired here so nothing can resurrect the session. The flags
 * mirror the writers (path '/', HttpOnly, Secure in production, Lax) so the
 * browser matches and deletes the same cookies. Expired below:
 * `quant_access_token` + `token` (current writers) and `quant_refresh_token`
 * (the cookie PR #861's SSO callback/ticket routes set).
 */
export async function POST() {
  const nextResp = NextResponse.json({ success: true, data: { signedOut: true } });
  const expired = {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 0,
    expires: new Date(0),
  };
  nextResp.cookies.set('quant_access_token', '', expired);
  nextResp.cookies.set('token', '', expired);
  // PR #861's SSO callback/ticket routes additionally set a
  // `quant_refresh_token` cookie; expiring it here too keeps sign-out
  // complete if that flow is live (a no-op where the cookie was never set).
  nextResp.cookies.set('quant_refresh_token', '', expired);
  return nextResp;
}
