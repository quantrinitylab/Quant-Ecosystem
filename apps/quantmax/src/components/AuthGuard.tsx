// ============================================================================
// QuantMax — login gate (interim).
// An unauthenticated visitor is sent to /login instead of staring at a
// permanently-loading shell. This is the interim logged-out experience: the
// intended end state for QuantMax is a public feed (browse logged-out, gate only
// actions), which needs a user-agnostic trending source in the feed engine — a
// separate follow-up. Until then, login-first beats a dead skeleton.
//
// The gate waits for the initial session-restore (isLoading) before deciding, so
// a returning user with a valid refresh cookie is never bounced, and /login is
// public so the redirect can't loop.
// ============================================================================
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../providers/auth-provider';
import { AuthPending } from '@quant/shared-ui';

const PUBLIC_ROUTES = new Set<string>(['/', '/login', '/discover', '/live', '/trending']);

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const isPublic = PUBLIC_ROUTES.has(router.pathname);

  useEffect(() => {
    if (isLoading || isPublic || isAuthenticated) return;
    if (typeof window !== 'undefined') {
      const search = window.location.search;
      if (search.includes('__quant_sso_ticket') || search.includes('token=')) {
        return;
      }
    }
    const returnTo = encodeURIComponent(router.asPath);
    void router.replace(`/login?returnTo=${returnTo}`);
  }, [isLoading, isPublic, isAuthenticated, router]);

  if (isPublic) return <>{children}</>;
  // Never `return null` here: a blank 200 is indistinguishable from a dead app
  // to a monitor, and if the client-side redirect below never runs the visitor
  // is stranded on an empty page. AuthPending always renders text and a real
  // link to /login.
  if (isLoading) return <AuthPending state="verifying" loginPath="/login" />;
  if (!isAuthenticated)
    return <AuthPending state="redirecting" loginPath="/login" appName="QuantMax" />;
  return <>{children}</>;
}
