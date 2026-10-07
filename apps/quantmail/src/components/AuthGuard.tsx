'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { LoadingState } from '@quant/shared-ui';
import { useAuth } from '../providers/auth-provider';

/** Exact signed-out product surface. Keep this short and auditable. */
const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/forgot-email',
  '/reset-password',
  '/help',
  '/terms',
  '/privacy',
  '/sso',
  '/oauth',
  '/quantgit',
  // Per-app public marketing landing (apps/quantmail/src/app/marketing). It is
  // the product's own "marketing" surface from the restructure and must be
  // readable signed-out, so it stays out of the login redirect.
  '/marketing',
];

function isInternalLabPath(pathname: string): boolean {
  return pathname === '/lab' || pathname.startsWith('/lab/');
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isPublicPath =
    PUBLIC_PATHS.includes(pathname ?? '') ||
    pathname?.startsWith('/sso') ||
    pathname?.startsWith('/oauth') ||
    pathname?.startsWith('/quantgit') ||
    isInternalLabPath(pathname ?? '');

  useEffect(() => {
    if (mounted && !isLoading && !isAuthenticated && !isPublicPath) {
      const search = typeof window !== 'undefined' ? window.location.search : '';
      const full = pathname ? `${pathname}${search}` : '';
      const returnTo = full && full !== '/' ? `?returnTo=${encodeURIComponent(full)}` : '';
      if (typeof window !== 'undefined') {
        window.location.replace(`/login${returnTo}`);
      }
    }
  }, [mounted, isLoading, isAuthenticated, isPublicPath, pathname]);

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
