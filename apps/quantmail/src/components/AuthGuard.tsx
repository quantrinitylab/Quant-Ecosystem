'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { LoadingState } from '@quant/shared-ui';
import { useAuth } from '../providers/auth-provider';
import { isKnownAppPath, isPublicPath } from '../lib/edge-public-paths';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Single source of truth: src/lib/edge-public-paths.ts (shared with the
  // edge middleware so server-side and client-side guards can never drift).
  const isPublic = isPublicPath(pathname ?? '');
  // Unknown routes (no matching app route) render the branded 404
  // (src/app/not-found.tsx) instead of bouncing to /login — mirrors the edge
  // middleware's known-route check exactly (fix/qm-unknown-route-404). A null
  // pathname (pre-hydration) keeps the safe default: guard.
  const isKnownRoute = pathname ? isKnownAppPath(pathname) : true;

  useEffect(() => {
    if (mounted && !isLoading && !isAuthenticated && !isPublic && isKnownRoute) {
      const search = typeof window !== 'undefined' ? window.location.search : '';
      const full = pathname ? `${pathname}${search}` : '';
      const returnTo = full && full !== '/' ? `?returnTo=${encodeURIComponent(full)}` : '';
      if (typeof window !== 'undefined') {
        window.location.replace(`/login${returnTo}`);
      }
    }
  }, [mounted, isLoading, isAuthenticated, isPublic, isKnownRoute, pathname]);

  if (isLoading && !isPublic && isKnownRoute) {
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

  if (!isAuthenticated && !isPublic && isKnownRoute) return null;

  return <>{children}</>;
}
