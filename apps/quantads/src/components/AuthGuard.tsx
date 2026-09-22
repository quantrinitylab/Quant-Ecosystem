'use client';

// ============================================================================
// QuantAds — login gate.
// QuantAds already authenticates via the shared @quant/shared-ui useAuth (which
// verifies a backend-issued token through /api/auth/userinfo), but had no gate:
// a logged-out visitor landed on an ungated shell. This redirects them to the
// existing /auth/login instead. Uses the same shared useAuth QuantAds already
// depends on — no new auth stack. Waits for the initial verify (isLoading) so a
// signed-in user is never bounced; /auth/login is public so the redirect can't loop.
// ============================================================================
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@quant/shared-ui';

const LOGIN_PATH = '/auth/login';
const PUBLIC_ROUTES = new Set<string>([LOGIN_PATH]);

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const isPublic = pathname ? PUBLIC_ROUTES.has(pathname) : false;

  useEffect(() => {
    if (isLoading || isPublic || isAuthenticated) return;
    const returnTo = encodeURIComponent(pathname ?? '/');
    router.replace(`${LOGIN_PATH}?returnTo=${returnTo}`);
  }, [isLoading, isPublic, isAuthenticated, pathname, router]);

  if (isPublic) return <>{children}</>;
  if (isLoading || !isAuthenticated) return null;
  return <>{children}</>;
}
