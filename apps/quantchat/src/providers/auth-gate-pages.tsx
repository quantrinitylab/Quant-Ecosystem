'use client';

// ============================================================================
// QuantChat - PagesAuthGate (Pages Router adapter for the shared AuthGate)
// ============================================================================
//
// The legacy Pages Router pages (src/pages/: calls, discover, settings,
// bitmoji) are NOT covered by the App Router root layout, so the App
// Router's AuthGate never ran for them — they rendered fully logged-out
// (P0, live audit 2026-10-11: /settings exposed its account-deletion UI
// to anonymous visitors). This adapter feeds the SAME router-agnostic
// AuthGateCore from next/router plumbing instead of next/navigation, and
// src/pages/_app.tsx mounts it around every Pages Router page, so both
// shells enforce one identical gate driven by src/lib/route-access.ts.

import { useCallback } from 'react';
import { useRouter } from 'next/router';
import { AuthGateCore } from './auth-gate';

export function PagesAuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // router.asPath is the real URL (router.pathname would be the route
  // pattern, e.g. '/404' when the Pages Router renders its 404 for an
  // unknown URL — the registry must see the actual path so unknown URLs
  // classify as 'unknown' and reach the 404 instead of bouncing to /login).
  // useRouter() can be null during prerender — classify as no path yet
  // ('unknown' -> render through) rather than crashing the shell.
  const rawPath = router?.asPath || router?.pathname || '';
  const pathname = rawPath ? rawPath.split(/[?#]/)[0] || '/' : null;

  const onRedirect = useCallback(
    (path: string) => {
      if (router) {
        void router.replace(path);
      } else if (typeof window !== 'undefined') {
        window.location.replace(path);
      }
    },
    [router],
  );

  return (
    <AuthGateCore pathname={pathname} onRedirect={onRedirect}>
      {children}
    </AuthGateCore>
  );
}
