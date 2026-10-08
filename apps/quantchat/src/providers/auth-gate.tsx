'use client';

// ============================================================================
// QuantChat - AuthGate
// ============================================================================
//
// Enforces a real, backend-verified session before any authed screen renders.
// On mount it re-hydrates the apiClient bearer from localStorage, then relies
// on the shared `useAuth` hook (which verifies the token against
// `/api/auth/userinfo`). While resolving it shows a loading state; an
// unauthenticated visitor is redirected to `/login`. FAIL CLOSED: no valid
// token => no app, no fabricated identity. The `/login` route is always allowed
// through so sign-in itself is reachable.

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth, LoadingState } from '@quant/shared-ui';
import { bootstrapSession } from '../lib/auth-session';

const PUBLIC_PATHS = new Set(['/login', '/terms', '/privacy', '/support']);

/**
 * How long we wait for the session check before admitting something is wrong.
 * Without this, a hanging network request traps the user on an infinite
 * spinner (P1: first load stuck on "Verifying your session...").
 */
const SESSION_CHECK_TIMEOUT_MS = 10_000;

/**
 * Whether a pathname is reachable without a session. The legal pages must
 * stay public: the login footer links to /terms, /privacy and /support, and
 * bouncing logged-out visitors back to /login from them was a dead loop
 * (P0-2).
 */
export function isPublicPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return PUBLIC_PATHS.has(pathname);
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();
  const [sessionTimedOut, setSessionTimedOut] = useState(false);

  // Re-hydrate the apiClient bearer from the stored token on first mount so
  // authed data fetches carry the JWT after a page reload.
  useEffect(() => {
    bootstrapSession();
  }, []);

  // If the session check hasn't settled within the timeout, stop showing the
  // spinner and show an honest error/retry state instead of hanging forever.
  useEffect(() => {
    if (!isLoading) return;
    setSessionTimedOut(false);
    const timer = window.setTimeout(() => setSessionTimedOut(true), SESSION_CHECK_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [isLoading]);

  const isPublic = isPublicPath(pathname);

  // Redirect unauthenticated visitors to sign-in (once identity resolution has
  // settled), except on public routes like /login itself.
  useEffect(() => {
    if (!isPublic && !isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isPublic, isLoading, isAuthenticated, router]);

  if (isPublic) return <>{children}</>;
  if (isLoading) {
    if (sessionTimedOut) return <SessionCheckTimeout onRetry={() => window.location.reload()} />;
    return <LoadingState variant="spinner" text="Verifying your session..." />;
  }
  if (!isAuthenticated) return <LoadingState variant="spinner" text="Redirecting to sign in..." />;
  return <>{children}</>;
}

/**
 * Honest fallback when the session check takes too long: explains what
 * happened and offers a retry instead of an infinite spinner.
 */
function SessionCheckTimeout({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center"
      role="alert"
    >
      <p className="text-base font-semibold text-[var(--quant-foreground)]">
        Taking longer than expected
      </p>
      <p className="max-w-sm text-sm text-[var(--quant-muted-foreground)]">
        We couldn&apos;t verify your session. Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-[44px] rounded-xl bg-[var(--brand-primary)] px-6 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
