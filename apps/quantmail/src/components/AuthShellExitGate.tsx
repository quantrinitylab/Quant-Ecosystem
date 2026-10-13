'use client';

// ============================================================================
// QuantMail — auth-shell exit gate
// ============================================================================
// The root layout renders a LEAN provider tree on the auth-form pages
// (/login, /register, /forgot-password, /reset-password — see
// `lib/edge-public-paths.ts`): no QueryClientProvider, no app providers.
// A layout is never re-rendered on a client-side navigation, so a soft
// navigation from one of those pages into the app (the login form's
// `router.push('/')` after sign-in) rendered the inbox INSIDE the lean tree and
// crashed with "No QueryClient set" — the first screen a brand-new account saw
// after signing in was "QuantMail couldn't open this view".
//
// This gate sits inside the lean tree only. While the route is an auth-form
// page it is a passthrough. The moment the route leaves them it renders
// nothing (so no app page ever mounts without its providers) and does one full
// document load of the new URL, which the server renders with the full shell.
// It uses the exact predicate the middleware uses to tag the lean shell, so
// the two can never disagree (no reload loop).
// ============================================================================

import { useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { isAuthShellPath } from '../lib/edge-public-paths';

export const authShellExit = {
  /** Full document load of the current URL (kept on an object so tests can spy). */
  reload(): void {
    window.location.replace(window.location.href);
  },
};

export function AuthShellExitGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const leaving = typeof pathname === 'string' && !isAuthShellPath(pathname);

  useEffect(() => {
    if (!leaving) return;
    // Next commits the new URL to history inside the same commit; defer one
    // task so `location.href` is already the destination.
    const id = window.setTimeout(() => authShellExit.reload(), 0);
    return () => window.clearTimeout(id);
  }, [leaving, pathname]);

  if (leaving) {
    return (
      <div role="status" aria-live="polite" className="sr-only" data-testid="auth-shell-exit">
        Opening QuantMail…
      </div>
    );
  }
  return <>{children}</>;
}

export default AuthShellExitGate;
