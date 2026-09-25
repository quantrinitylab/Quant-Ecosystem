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
      const search = window.location.search;
      if (search.includes('__quant_sso_ticket') || search.includes('token=')) {
        // If SSO ticket/token is present in URL, let AuthProvider mount effect ingest it without flashing /login
        return;
      }
    }
    const returnTo = encodeURIComponent(pathname ?? '/');
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
