'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LoadingState } from '@quant/shared-ui';
import { useAuth } from '../providers/auth-provider';

const PUBLIC_PATHS = ['/login', '/register', '/forgot-password'];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isPublicPath = PUBLIC_PATHS.includes(pathname ?? '');

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isPublicPath) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, isPublicPath, router]);

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
