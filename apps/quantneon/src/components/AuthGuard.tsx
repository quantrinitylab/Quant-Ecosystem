// ============================================================================
// QuantGram — login gate.
// QuantGram is a login-first experience (like Instagram): an unauthenticated
// visitor is sent to /login instead of staring at an empty, permanently-loading
// shell. The gate waits for the initial session-restore (isLoading) before
// deciding, so a returning user with a valid refresh cookie is never bounced.
// /login itself is public so the redirect can't loop.
// ============================================================================
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../providers/auth-provider';

const PUBLIC_ROUTES = new Set<string>(['/login']);

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const isPublic = PUBLIC_ROUTES.has(router.pathname);

  useEffect(() => {
    if (isLoading || isPublic || isAuthenticated) return;
    const returnTo = encodeURIComponent(router.asPath);
    void router.replace(`/login?returnTo=${returnTo}`);
  }, [isLoading, isPublic, isAuthenticated, router]);

  // Public route: always render. Otherwise hold until the session is known, and
  // render nothing while we redirect an unauthenticated visitor.
  if (isPublic) return <>{children}</>;
  if (isLoading || !isAuthenticated) return null;
  return <>{children}</>;
}
