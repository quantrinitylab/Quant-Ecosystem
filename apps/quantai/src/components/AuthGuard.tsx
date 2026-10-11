'use client';

// ============================================================================
// QuantAI — login gate (App Router).
// Unauthenticated visitors are sent to /login instead of a permanently-loading
// shell. Waits for the initial session-restore before deciding, so a returning
// user with a valid refresh cookie is never bounced; /login is public so the
// redirect can't loop.
// ============================================================================
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../providers/auth-provider';
import { AuthPending } from '@quant/shared-ui';

const PUBLIC_ROUTES = new Set<string>(['/login', '/']);

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const isPublic = pathname ? PUBLIC_ROUTES.has(pathname) : false;

  useEffect(() => {
    if (isLoading || isPublic || isAuthenticated) return;
    if (typeof window !== 'undefined') {
      // Robust handoff detection: check actual param names instead of a
      // substring match (a param like `?sometoken=x` must not suppress the
      // login redirect, and a real ticket must never flash /login).
      let hasHandoffParams = false;
      try {
        const params = new URLSearchParams(window.location.search);
        hasHandoffParams = ['__quant_sso_ticket', 'token', 'accessToken', 'access_token'].some(
          (name) => params.has(name),
        );
      } catch {
        hasHandoffParams = false;
      }
      if (hasHandoffParams) {
        // If SSO ticket/token is present in URL, let AuthProvider mount effect ingest it without flashing /login
        return;
      }
    }
    // Preserve the full intended destination (path + query) so deep links
    // like /voice?draft=1 survive the sign-in round trip.
    const fullPath =
      typeof window !== 'undefined'
        ? window.location.pathname + window.location.search
        : (pathname ?? '/');
    const returnTo = encodeURIComponent(fullPath || '/');
    router.replace(`/login?returnTo=${returnTo}`);
  }, [isLoading, isPublic, isAuthenticated, pathname, router]);

  if (isPublic) return <>{children}</>;
  // Never `return null` here: a blank 200 is indistinguishable from a dead app
  // to a monitor, and if the client-side redirect below never runs the visitor
  // is stranded on an empty page. AuthPending always renders text and a real
  // link to /login.
  if (isLoading) return <AuthPending state="verifying" loginPath="/login" />;
  if (!isAuthenticated)
    return <AuthPending state="redirecting" loginPath="/login" appName="QuantAI" />;
  return <>{children}</>;
}
