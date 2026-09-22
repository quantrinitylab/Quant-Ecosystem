'use client';

// ============================================================================
// QuantWave — login gate (App Router).
// Unauthenticated visitors are sent to /login instead of a permanently-loading
// shell. Waits for the initial session-restore before deciding, so a returning
// user with a valid refresh cookie is never bounced; /login is public so the
// redirect can't loop.
// ============================================================================
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../providers/auth-provider';

const PUBLIC_ROUTES = new Set<string>(['/login']);

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const isPublic = pathname ? PUBLIC_ROUTES.has(pathname) : false;

  useEffect(() => {
    if (isLoading || isPublic || isAuthenticated) return;
    const returnTo = encodeURIComponent(pathname ?? '/');
    router.replace(`/login?returnTo=${returnTo}`);
  }, [isLoading, isPublic, isAuthenticated, pathname, router]);

  if (isPublic) return <>{children}</>;
  if (isLoading || !isAuthenticated) return null;
  return <>{children}</>;
}
