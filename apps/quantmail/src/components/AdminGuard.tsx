'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LoadingState } from '@quant/shared-ui';
import { useAuth } from '../providers/auth-provider';

/**
 * Roles allowed into QuantMail's own admin console.
 *
 * Part of the per-app platform-presence restructure: each of the nine products
 * role-gates its OWN `/admin` segment rather than funnelling staff into a shared
 * `admin-enterprise` shell. Authentication is already enforced upstream by the
 * root-layout `AuthGuard`, so by the time a request reaches here the visitor is
 * signed in — `AdminGuard` adds ONLY the authorization (role) decision.
 *
 * `USER` role maps to `AuthUser.role` surfaced from `/oauth/userinfo`; the DB
 * enum is `{ USER, ADMIN, MODERATOR, CREATOR, ADVERTISER }`. Staff = ADMIN +
 * MODERATOR. Kept as a Set so widening access later is a one-line change.
 */
const ADMIN_ROLES = new Set(['ADMIN', 'MODERATOR']);

export function isAdminRole(role: string | undefined | null): boolean {
  return role != null && ADMIN_ROLES.has(role.toUpperCase());
}

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, user } = useAuth();
  const router = useRouter();

  const authorized = isAuthenticated && isAdminRole(user?.role);

  useEffect(() => {
    // Authentication is the root AuthGuard's job — an unauthenticated visitor is
    // already bounced to /login before this segment renders. The only decision
    // left is authorization: a signed-in-but-not-staff account must not linger on
    // an admin URL, so send it back to the inbox.
    if (!isLoading && isAuthenticated && !authorized) {
      router.replace('/');
    }
  }, [isLoading, isAuthenticated, authorized, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--quant-background)]">
        <LoadingState text="Checking admin access…" />
      </div>
    );
  }

  // Not authenticated: defer entirely to AuthGuard's redirect (render nothing).
  if (!isAuthenticated) {
    return null;
  }

  // Signed in, but not staff. The effect above redirects to the inbox; until it
  // runs we show an honest access-denied panel instead of a blank screen.
  if (!authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--quant-background)] px-6">
        <div className="w-full max-w-md rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-8 text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 text-red-400">
            <svg
              className="size-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-[var(--quant-foreground)]">
            Admin access required
          </h1>
          <p className="mt-2 text-sm text-[var(--quant-muted-foreground)]">
            Your account doesn&apos;t have the QuantMail staff role needed to open the admin
            console. Redirecting you back to your inbox…
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-4 py-2 text-sm font-medium text-[var(--quant-foreground)] transition-colors hover:bg-[var(--quant-card)]"
          >
            Return to Mail
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
