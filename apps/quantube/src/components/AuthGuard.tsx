// ============================================================================
// Quantube — login gate (interim).
// Unauthenticated visitors are sent to /login instead of a permanently-loading
// shell. Intended end state for Quantube is a public browse experience (watch
// logged-out, gate only actions), which needs a public/anonymous content source
// in the feed engine — a separate follow-up. Until then, login-first beats a
// dead skeleton. Waits for session-restore before deciding; /login is public so
// the redirect can't loop.
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

  if (isPublic) return <>{children}</>;
  if (isLoading || !isAuthenticated) return null;
  return <>{children}</>;
}
