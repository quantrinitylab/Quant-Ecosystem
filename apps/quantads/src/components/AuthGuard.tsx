'use client';

// ============================================================================
// QuantAds — login gate.
// A logged-out visitor used to land on an ungated shell, and the earlier guard
// sent them to /auth/login, which is not the ecosystem's canonical route.
// It now waits for the initial verify (isLoading) so a signed-in user is never
// bounced, then redirects to /login with a validated returnTo so the visitor
// resumes where they were. The sign-in routes stay public so nothing loops.
//
// This is a UX boundary, not a security one: every API call is still authorised
// server-side by QuantMail.
// ============================================================================
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AuthPending } from '@quant/shared-ui';
import { useAuth } from '../providers/auth-provider';
import { LOGIN_PATH, PUBLIC_PATHS, loginHref } from '../lib/return-path';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const isPublic = pathname ? PUBLIC_PATHS.has(pathname) : false;

  useEffect(() => {
    if (isLoading || isPublic || isAuthenticated) return;
    router.replace(loginHref(pathname));
  }, [isLoading, isPublic, isAuthenticated, pathname, router]);

  if (isPublic) return <>{children}</>;
  // Never `return null` here: a blank 200 is indistinguishable from a dead app
  // to a monitor, and if the client-side redirect above never runs the visitor
  // is stranded on an empty page. AuthPending always renders text and a real
  // link to LOGIN_PATH.
  if (isLoading) return <AuthPending state="verifying" loginPath={LOGIN_PATH} />;
  if (!isAuthenticated)
    return <AuthPending state="redirecting" loginPath={LOGIN_PATH} appName="QuantAds" />;
  return <>{children}</>;
}
