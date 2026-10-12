'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { LoadingState } from '@quant/shared-ui';
import { useAuth } from '../providers/auth-provider';
import { isPublicPath } from '../lib/edge-public-paths';

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

  useEffect(() => {
    if (mounted && !isLoading && !isAuthenticated && !isPublic) {
      const search = typeof window !== 'undefined' ? window.location.search : '';
      const full = pathname ? `${pathname}${search}` : '';
      const returnTo = full && full !== '/' ? `?returnTo=${encodeURIComponent(full)}` : '';
      if (typeof window !== 'undefined') {
        window.location.replace(`/login${returnTo}`);
      }
    }
  }, [mounted, isLoading, isAuthenticated, isPublic, pathname]);

  if (isLoading && !isPublic) {
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

  if (!isAuthenticated && !isPublic) return null;

  return <>{children}</>;
}
