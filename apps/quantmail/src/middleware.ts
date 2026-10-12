import { NextRequest, NextResponse } from 'next/server';
import { AUTH_SHELL_HEADER, isAuthShellPath, isPublicPath } from './lib/edge-public-paths';

// ============================================================================
// QuantMail edge middleware — kill the logged-out double-boot on `/`.
//
// Measured 2026-10-12 (real Chrome): a signed-out visitor to `/` paid a full
// client boot of the app shell (spinner → hydration → auth-provider hydrate)
// only for AuthGuard to `window.location.replace('/login')` and boot a SECOND
// time — 17.7s to a usable form on mobile. This middleware performs the same
// redirect server-side, before any JavaScript ships, when there is provably
// no session.
//
// Session signal: the HttpOnly `quantmail_refresh` cookie
// (apps/quantmail/backend/lib/auth-session.ts). Absent cookie ⇒ definitely
// signed out ⇒ redirect now. Present cookie ⇒ let the request through;
// AuthGuard remains the fallback (it re-validates via /auth/refresh and still
// bounces expired sessions client-side).
// ============================================================================

export const REFRESH_COOKIE_NAME = 'quantmail_refresh';

// Re-exported for tests and for parity assertions against AuthGuard.
export { AUTH_SHELL_HEADER, isAuthShellPath, isPublicPath };

/**
 * Build the /login redirect for a signed-out request, mirroring AuthGuard's
 * returnTo rule: plain `/login` for `/`, `?returnTo=<path+query>` otherwise.
 */
export function buildLoginRedirect(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.search = '';
  if (pathname !== '/') {
    loginUrl.searchParams.set('returnTo', `${pathname}${search}`);
  }
  return NextResponse.redirect(loginUrl);
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) {
    // Public auth-form pages render the minimal auth shell (brand + auth
    // session only). Tag the request so the root layout can branch its
    // provider tree server-side, before any JavaScript ships.
    if (isAuthShellPath(pathname)) {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set(AUTH_SHELL_HEADER, 'auth');
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    return NextResponse.next();
  }
  // No refresh cookie ⇒ provably signed out ⇒ redirect server-side.
  // Cookie present ⇒ signed-in (or stale) ⇒ let through; AuthGuard validates.
  if (!request.cookies.has(REFRESH_COOKIE_NAME)) {
    return buildLoginRedirect(request);
  }
  return NextResponse.next();
}

// Run on page routes only: never on API, Next internals, or static assets.
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|json|txt|xml|woff2?)).*)',
  ],
};
