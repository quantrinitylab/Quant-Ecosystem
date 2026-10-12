// ============================================================================
// QuantMail public (signed-out) route surface — single source of truth.
//
// Imported by BOTH:
//   - src/middleware.ts (edge runtime — this file must stay dependency-free
//     and free of client-only APIs), and
//   - src/components/AuthGuard.tsx (client component, fallback redirect).
//
// Keep this list short and auditable. Any path added here becomes reachable
// without a session in both the server-side and client-side guards.
// ============================================================================

/** Exact signed-out product surface. */
export const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/help',
  '/terms',
  '/privacy',
  '/sso',
  '/oauth',
  '/quantgit',
  // Per-app public marketing landing (apps/quantmail/src/app/marketing). It is
  // the product's own "marketing" surface from the restructure and must be
  // readable signed-out, so it stays out of the login redirect.
  '/marketing',
] as const;

/** Mirrors AuthGuard's path rules exactly (incl. prefix rules). */
export function isPublicPath(pathname: string): boolean {
  if ((PUBLIC_PATHS as readonly string[]).includes(pathname)) return true;
  if (pathname.startsWith('/sso')) return true;
  if (pathname.startsWith('/oauth')) return true;
  if (pathname.startsWith('/quantgit')) return true;
  if (pathname === '/lab' || pathname.startsWith('/lab/')) return true;
  // Invite / group-join previews for logged-out invitees (QM-SCREEN-018):
  // the join page renders a public preview before the visitor signs in.
  if (pathname.startsWith('/invite/')) return true;
  if (pathname.startsWith('/groups/join/')) return true;
  // Public calendar booking links (fix/qm-booking-guest-bounce): the booking
  // page is a fully public, signed-out booking flow (backend GET/POST booking
  // endpoints are public), so guests opening a host's booking link must see
  // the flow — or the honest dead-link state for a bad slug — instead of
  // being hard-bounced to /login.
  if (pathname.startsWith('/calendar/booking/')) return true;
  // Public Drive share landing page (/drive/share/<token>): documented as
  // "Public page: no AppShell, no auth requirement" — share links must open
  // for signed-out recipients. NOTE: AuthGuard never exempted this path, so
  // signed-out share opens are bounced client-side today; exempting it here
  // fixes both guards at once (see queue finding [dblboot-fix]).
  if (pathname.startsWith('/drive/share/')) return true;
  // Legacy document share URLs redirect server-side to /drive/share/<token>;
  // the redirect must run before any auth bounce.
  if (pathname.startsWith('/documents/public/')) return true;
  return false;
}
