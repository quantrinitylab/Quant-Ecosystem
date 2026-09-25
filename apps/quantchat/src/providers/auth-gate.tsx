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

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth, LoadingState, UniversalSSOTokenBridge } from '@quant/shared-ui';
import { bootstrapSession, persistSession } from '../lib/auth-session';

const PUBLIC_PATHS = new Set(['/login']);

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();

  // Re-hydrate the apiClient bearer from the stored token on first mount so
  // authed data fetches carry the JWT after a page reload. If arriving from an
  // SSO redirect with `?__quant_sso_ticket=...` or `?token=...`, persist it immediately before resolving auth.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const bridge = UniversalSSOTokenBridge.getInstance();
        const consumed = bridge.consumeHandoffTicket();
        const params = new URLSearchParams(window.location.search);
        const ticketParam = params.get('__quant_sso_ticket');
        const tokenParam =
          params.get('token') || params.get('accessToken') || params.get('access_token');
        const refreshToken =
          params.get('refreshToken') || params.get('refresh_token') || tokenParam || '';

        const resolvedToken =
          consumed?.session?.token ||
          consumed?.ticket ||
          (ticketParam ? bridge.verifyHandoffTicket(ticketParam)?.token || ticketParam : null) ||
          tokenParam;

        if (resolvedToken) {
          persistSession(resolvedToken, refreshToken || resolvedToken);
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        }
      } catch {
        // Sandboxed environment
      }
    }
    bootstrapSession();
  }, []);

  const isPublic = pathname ? PUBLIC_PATHS.has(pathname) : false;

  // Redirect unauthenticated visitors to sign-in (once identity resolution has
  // settled), except on public routes like /login itself.
  useEffect(() => {
    if (!isPublic && !isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isPublic, isLoading, isAuthenticated, router]);

  if (isPublic) return <>{children}</>;
  if (isLoading) return <LoadingState variant="spinner" text="Verifying your session..." />;
  if (!isAuthenticated) return <LoadingState variant="spinner" text="Redirecting to sign in..." />;
  return <>{children}</>;
}
