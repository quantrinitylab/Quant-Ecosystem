import { NextRequest, NextResponse } from 'next/server';
import {
  AUTH_SHELL_HEADER,
  REFRESH_COOKIE_NAME as SHARED_REFRESH_COOKIE_NAME,
  isAuthShellPath,
  isKnownAppPath,
  isPublicPath,
} from './lib/edge-public-paths';

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
// Exception (fix/qm-unknown-route-404): unknown routes (no matching app route
// per isKnownAppPath) are let through so the framework renders the branded
// 404 instead of bouncing a dead link to /login.
//
// Session signal: the HttpOnly `quantmail_refresh` cookie
// (apps/quantmail/backend/lib/auth-session.ts). Absent cookie ⇒ definitely
// signed out ⇒ redirect now. Present cookie ⇒ let the request through;
// AuthGuard remains the fallback (it re-validates via /auth/refresh and still
// bounces expired sessions client-side).
// ============================================================================

// Re-exported from the shared module for existing importers (tests).
export const REFRESH_COOKIE_NAME = SHARED_REFRESH_COOKIE_NAME;

// Re-exported for tests and for parity assertions against AuthGuard.
export { AUTH_SHELL_HEADER, isAuthShellPath, isKnownAppPath, isPublicPath };

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

/**
 * Edge-cache policy for the static auth shell (fix/qm-login-paint-vs-gmail).
 *
 * The four auth-form pages render identical HTML for a given URL for every
 * signed-out visitor: all session state is client-side, and search-param
 * notices (`?success=`, `?switch_to=`) vary only by query string, which
 * shared caches key on by default. Marking the document response publicly cacheable lets
 * the CDN serve the shell from the edge instead of paying a cold origin
 * render per visitor (measured cold TTFB 3.1s vs warm 0.45-0.64s).
 *
 * RSC (flight) and prefetch requests are EXCLUDED: they carry `RSC: 1` and
 * expect a `text/x-component` payload — serving them a cached document would
 * corrupt client-side navigation. `max-age=0` keeps browsers revalidating
 * (no stale form from bfcache/history); only shared caches hold the 120s
 * copy. Next.js never overrides an already-set Cache-Control
 * (send-payload.js), so this header survives to the client.
 */
export const AUTH_SHELL_CACHE_CONTROL =
  'public, max-age=0, s-maxage=120, stale-while-revalidate=600';

/** App Router flight / prefetch requests carry `RSC: 1`, never `text/html`. */
export function isRscRequest(request: NextRequest): boolean {
  return request.headers.has('rsc');
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
      const response = NextResponse.next({ request: { headers: requestHeaders } });
      // Edge-cache the static shell document; never the RSC flight payload.
      if (!isRscRequest(request)) {
        response.headers.set('Cache-Control', AUTH_SHELL_CACHE_CONTROL);
      }
      return response;
    }
    return NextResponse.next();
  }
  // Unknown route (no matching app route): let the request through so the
  // framework renders the branded 404 (src/app/not-found.tsx) instead of
  // bouncing a dead link to /login with a returnTo that 404s again after
  // sign-in (fix/qm-unknown-route-404).
  if (!isKnownAppPath(pathname)) {
    return NextResponse.next();
  }
  // No refresh cookie ⇒ provably signed out ⇒ redirect server-side.
  // Cookie present ⇒ signed-in (or stale) ⇒ let through; AuthGuard validates.
  if (!request.cookies.has(REFRESH_COOKIE_NAME)) {
    return buildLoginRedirect(request);
  }
  return NextResponse.next();
}

// Run on page routes only: never on API, Next internals, or static assets
// (incl. the document engines' .wasm under /engines/docs/).
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|json|txt|xml|woff2?|wasm)).*)',
  ],
};
