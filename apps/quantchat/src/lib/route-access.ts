// ============================================================================
// QuantChat - Route access registry
// ============================================================================
//
// SINGLE SOURCE OF TRUTH for which URL paths exist and what access they
// require. The auth gate (App Router `AuthGate` + Pages Router
// `PagesAuthGate`) classifies every pathname through here:
//
//   - 'public'  — reachable without a session (sign-in, legal, recovery).
//   - 'app'     — a real app route: requires a verified session, otherwise
//                 the visitor is redirected to /login.
//   - 'unknown' — no such route: the gate steps aside and lets the router
//                 render its 404 instead of masking the bad link behind a
//                 login redirect (P2: unknown paths used to bounce to
//                 /login, making broken links undetectable).
//
// WHY THIS EXISTS (P0, live audit 2026-10-11): gating used to be an
// implicit "anything that is not /login is gated" rule inside a client
// component that only the App Router layout mounted. The legacy Pages
// Router shell (src/pages/_app.tsx) mounted NO gate at all, so /settings,
// /calls and /discover rendered fully logged-out — including the account
// deletion UI. Every route must be registered here; the regression suite
// (src/__tests__/route-gating-coverage.test.ts) walks the filesystem and
// FAILS if a page exists that this registry does not classify, so a future
// route cannot ship ungated by accident.

/** Paths reachable without a session. Exact matches only. */
export const PUBLIC_PATHS: ReadonlySet<string> = new Set([
  '/login',
  '/terms',
  '/privacy',
  '/support',
  // Password recovery is hosted on QuantMail (the identity host); the local
  // /forgot-password page just hands the visitor over there. It must be
  // public or the gate would bounce logged-out users back to /login before
  // the handoff can happen — the exact dead-end the audit filed as P1.
  '/forgot-password',
]);

/**
 * Real app routes that require a session. Static paths are exact matches;
 * dynamic segments are expressed as patterns below. Keep this list in sync
 * with the filesystem — the coverage test enforces it both ways.
 */
export const APP_ROUTES: readonly string[] = [
  // App Router (src/app/**/page.tsx)
  '/',
  '/camera',
  '/channels',
  '/map',
  '/meet',
  '/memories',
  '/new-chat',
  '/profile',
  '/reels',
  '/register',
  '/spotlight',
  '/stories',
  // Pages Router (src/pages/*.tsx)
  '/bitmoji',
  '/calls',
  '/discover',
  '/settings',
];

/** Dynamic app routes: /chat/[id] and /meet/[roomId]. */
const APP_ROUTE_PATTERNS: readonly RegExp[] = [/^\/chat\/[^/]+$/, /^\/meet\/[^/]+$/];

const APP_ROUTE_SET: ReadonlySet<string> = new Set(APP_ROUTES);

export type RouteAccess = 'public' | 'app' | 'unknown';

/**
 * Whether a pathname is reachable without a session. Exact matches only —
 * '/terms/' is NOT public (Next redirects the trailing slash away before
 * the gate ever sees it, and a strict set keeps look-alike paths gated).
 */
export function isPublicPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return PUBLIC_PATHS.has(pathname);
}

/** Classify a pathname for the auth gate. */
export function classifyPath(pathname: string | null): RouteAccess {
  if (!pathname) return 'unknown';
  if (PUBLIC_PATHS.has(pathname)) return 'public';
  if (APP_ROUTE_SET.has(pathname)) return 'app';
  for (const pattern of APP_ROUTE_PATTERNS) {
    if (pattern.test(pathname)) return 'app';
  }
  return 'unknown';
}
