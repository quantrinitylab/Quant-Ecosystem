'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LoadingState } from '@quant/shared-ui';
import { useAuth } from '../providers/auth-provider';

const PUBLIC_PATHS = ['/login', '/register', '/forgot-password'];

/**
 * Internal design labs under `/lab/…` render without a session. They read no
 * user data — a lab page is a shader and a row of sliders — and the thing that
 * actually keeps them off the live deployment is the server: those routes are
 * `force-dynamic` and call `notFound()` unless `QUANT_ENABLE_LABS` is set, so
 * this clause is unreachable in production. Kept separate from `PUBLIC_PATHS`
 * because that list is the product's sign-in surface and should stay a short,
 * exact-match, auditable set of three.
 */
function isInternalLabPath(pathname: string): boolean {
  return pathname === '/lab' || pathname.startsWith('/lab/');
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isPublicPath = PUBLIC_PATHS.includes(pathname ?? '') || isInternalLabPath(pathname ?? '');

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isPublicPath) {
      const returnTo =
        pathname && pathname !== '/' ? `?returnTo=${encodeURIComponent(pathname)}` : '';
      router.replace(`/login${returnTo}`);
    }
  }, [isLoading, isAuthenticated, isPublicPath, router, pathname]);

  if (isLoading && !isPublicPath) {
    return (
      <div
        className="flex h-screen w-full items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <LoadingState text="Authenticating..." />
      </div>
    );
  }

  if (!isAuthenticated && !isPublicPath) return null;

  return <>{children}</>;
}
