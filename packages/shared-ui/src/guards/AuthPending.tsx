// ============================================================================
// Shared UI - Auth Pending Screen
//
// Every per-app AuthGuard used to end like this:
//
//   if (isLoading || !isAuthenticated) return null;
//
// which is how several hosts spent weeks answering HTTP 200 with a page that
// rendered nothing. Two separate costs came out of that `null`:
//
//   1. A logged-out visitor sees a blank white screen for the whole round trip
//      of the session check, and forever if the client-side `router.replace`
//      never runs — a hydration error, a chunk that 404s after a deploy, or JS
//      disabled all produce a permanently empty page with no way forward.
//   2. Uptime monitoring cannot tell the difference between that and a working
//      app, because the status code is 200 either way.
//
// So the guards render this instead. It always emits text, and it always
// includes a real `<a href>` to the login path, which means the signed-out
// experience degrades to a working link rather than to nothing.
// ============================================================================

import React from 'react';

export type AuthPendingState = 'verifying' | 'redirecting';

export interface AuthPendingProps {
  /**
   * `verifying` while the session check is in flight, `redirecting` once we
   * know the visitor is signed out and the guard is navigating to login.
   */
  state: AuthPendingState;
  /** Login path for the fallback link. Must be same-origin. */
  loginPath?: string;
  /** Product name, so the message reads like the app and not like a framework. */
  appName?: string;
}

const COPY: Record<AuthPendingState, { heading: string; body: string }> = {
  verifying: {
    heading: 'Checking your session',
    body: 'One moment while we confirm you are signed in.',
  },
  redirecting: {
    heading: 'Sign in to continue',
    body: 'Taking you to sign in with your Quant account.',
  },
};

/**
 * Visible holding state for a route guard. Not a security boundary: the guard
 * that renders it is UX only, and the server must still authorize every call.
 */
export const AuthPending: React.FC<AuthPendingProps> = ({
  state,
  loginPath = '/login',
  appName,
}) => {
  const copy = COPY[state];
  const heading = appName && state === 'redirecting' ? `Sign in to ${appName}` : copy.heading;

  return (
    <div
      className="flex min-h-screen w-full flex-col items-center justify-center gap-3 bg-[var(--quant-background)] p-8 text-center"
      role="status"
      aria-live="polite"
      // `aria-busy` only while we are actually waiting on the session check;
      // once we know the answer the screen is a destination, not a spinner.
      aria-busy={state === 'verifying'}
    >
      <h1 className="text-lg font-semibold text-[var(--quant-foreground)]">{heading}</h1>
      <p className="max-w-sm text-sm text-[var(--quant-muted-foreground)]">{copy.body}</p>
      <a
        className="mt-2 min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium text-[var(--quant-foreground)] underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-[var(--quant-foreground)]"
        href={loginPath}
      >
        Go to sign in
      </a>
    </div>
  );
};
