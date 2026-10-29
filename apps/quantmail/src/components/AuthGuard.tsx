'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '../providers/auth-provider';
import { isKnownAppPath, isPublicPath } from '../lib/edge-public-paths';
import { markSplashShown } from '../lib/splash-session';
import {
  QW_SPLASH_EXIT_MS,
  QuantWorkplaceRevolvingSplash,
} from './workplace/QuantWorkplaceRevolvingSplash';

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
  const isGuarded = !isPublic && isKnownRoute;

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

  // The QuantWorkplace splash stands in for the old "Authenticating..." text.
  //
  // `isLoading` starts true, so the server-rendered HTML of every guarded route
  // already contains the splash: it is the first paint, before any JavaScript
  // runs, and the browser hydrates exactly the same markup (the splash is
  // deterministic, see its header). The words "Authenticating..." are still
  // announced, once, inside the splash's own live region, and never drawn.
  //
  // Signed out (stale cookie, refresh refused): the splash stays up until the
  // browser has left for /login, rather than blanking the page first.
  const isRestoring = isLoading && isGuarded;
  const showSplash = isRestoring || (!isLoading && !isAuthenticated && isGuarded);

  // Hand-over. When the session settles signed-in, the app mounts underneath the
  // splash and the splash fades out for QW_SPLASH_EXIT_MS instead of vanishing in
  // one frame, so the loading state never flashes and nothing waits on it: the
  // fading splash ignores pointer events and holds no minimum display time. The
  // flag is derived while rendering (not in an effect) so the app and the fading
  // splash arrive in the same commit.
  const [wasRestoring, setWasRestoring] = useState(isRestoring);
  const [handingOver, setHandingOver] = useState(false);
  if (wasRestoring !== isRestoring) {
    setWasRestoring(isRestoring);
    setHandingOver(wasRestoring && !isRestoring && isAuthenticated);
  }

  useEffect(() => {
    if (!handingOver) return;
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => setHandingOver(false), reduceMotion ? 0 : QW_SPLASH_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [handingOver]);

  // QuantumSplashIntro (once per session, inside AppShell) skips itself when a
  // splash has already been painted, so the visitor never sees it twice.
  useEffect(() => {
    if (showSplash) markSplashShown();
  }, [showSplash]);

  // The splash keeps one position in the fragment across loading, hand-over and
  // redirect, so it is never remounted (which would restart its rotation).
  return (
    <>
      {showSplash ? null : children}
      {showSplash || handingOver ? (
        <QuantWorkplaceRevolvingSplash message="Authenticating..." leaving={!showSplash} />
      ) : null}
    </>
  );
}
