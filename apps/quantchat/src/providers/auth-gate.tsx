'use client';

// ============================================================================
// QuantChat - AuthGate
// ============================================================================
//
// Enforces a real, backend-verified session before any authed screen renders.
// On mount it re-hydrates the apiClient bearer from localStorage, then relies
// on the shared `useAuth` hook (which verifies the token against
// `/api/auth/userinfo`). While resolving it shows a loading state; an
// unauthenticated visitor on an app route is redirected to `/login`.
// FAIL CLOSED: no valid token => no app, no fabricated identity.
//
// ROUTER PARITY (P0, live audit 2026-10-11): this gate used to be mounted
// ONLY by the App Router root layout (via AppProviders). The legacy Pages
// Router shell (src/pages/_app.tsx) mounted no gate at all, so /settings,
// /calls and /discover rendered fully logged-out — settings even exposed
// the account-deletion UI. The gate's decision logic now lives in the
// router-agnostic `AuthGateCore`; this file's `AuthGate` adapts it to the
// App Router (next/navigation) and `auth-gate-pages.tsx` adapts the SAME
// core to the Pages Router (next/router), so every route in the app is
// gated by one mechanism. Which paths are gated is decided by the route
// registry (src/lib/route-access.ts), not by which shell renders them.
//
// 404 HONESTY (P2): an unknown path is NOT bounced to /login. The gate
// steps aside and lets the router render its 404, so broken links stay
// detectable instead of masquerading as auth redirects.
//
// DEEP-LINK PRESERVATION (QC-F-049): the bounce to /login carries the
// intended destination as a validated `returnTo` (src/lib/return-to.ts),
// so a notification click or cross-app handoff reaches its conversation
// after sign-in instead of dying on the chat list.

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth, LoadingState } from '@quant/shared-ui';
import { bootstrapSession } from '../lib/auth-session';
import { classifyPath, isPublicPath } from '../lib/route-access';
import { buildLoginRedirect } from '../lib/return-to';

export { isPublicPath };

/**
 * How long we wait for the session check before admitting something is wrong.
 * Without this, a hanging network request traps the user on an infinite
 * spinner (P1: first load stuck on "Verifying your session...").
 */
const SESSION_CHECK_TIMEOUT_MS = 10_000;

interface AuthGateCoreProps {
  /** Current pathname (query/hash stripped), from either router. */
  pathname: string | null;
  /**
   * Everything after the pathname in the current URL ('?query' and/or
   * '#hash'), from either router. Preserved across the login bounce as the
   * post-login return target (QC-F-049) — a deep link's query (e.g. a
   * meet join code) is part of the destination, not decoration.
   */
  suffix?: string | null;
  /**
   * Whether `suffix` is the captured suffix FOR THE CURRENT pathname.
   * Shells that read the suffix asynchronously (the App Router adapter
   * reads window.location in an effect) pass false until the capture for
   * this pathname has landed, and the redirect below waits: React runs
   * child effects before parent effects, so without an explicit
   * readiness signal this core would redirect with a stale/null suffix
   * on an initially settled logged-out session and the deep link's
   * query/hash would be lost (PR #961 review). Shells that know the
   * suffix synchronously (Pages Router, from router.asPath) omit this —
   * undefined means ready.
   */
  suffixReady?: boolean;
  /** Navigate away (router.replace semantics) — supplied by each shell. */
  onRedirect: (path: string) => void;
  children: React.ReactNode;
}

/**
 * The shared gate. Both router shells render this with their own pathname /
 * redirect plumbing; everything else — session bootstrap, timeout, fail-
 * closed rendering — is identical for every route in the app.
 */
export function AuthGateCore({ pathname, suffix, suffixReady, onRedirect, children }: AuthGateCoreProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const [sessionTimedOut, setSessionTimedOut] = useState(false);

  // Re-hydrate the apiClient bearer from the stored token on first mount so
  // authed data fetches carry the JWT after a page reload.
  useEffect(() => {
    bootstrapSession();
  }, []);

  // If the session check hasn't settled within the timeout, stop showing the
  // spinner and show an honest error/retry state instead of hanging forever.
  useEffect(() => {
    if (!isLoading) return;
    setSessionTimedOut(false);
    const timer = window.setTimeout(() => setSessionTimedOut(true), SESSION_CHECK_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [isLoading]);

  const access = classifyPath(pathname);
  const isGated = access === 'app';

  // Redirect unauthenticated visitors on real app routes to sign-in (once
  // identity resolution has settled). Public routes pass straight through,
  // and unknown paths fall through to the router's 404. The destination is
  // carried along as a validated returnTo (QC-F-049): without it, every
  // deep link — notification clicks, cross-app handoffs, shared chat
  // links — landed on the chat list after login instead of its target.
  // The redirect also waits for suffix readiness when the shell signals
  // it (suffixReady === false): firing earlier would bake a missing
  // query/hash into the one navigation that actually happens, because
  // once the router lands on /login (a public path) no second redirect
  // corrects it. While waiting, the render below keeps showing the
  // "Redirecting to sign in..." state — no protected content flashes.
  useEffect(() => {
    if (isGated && !isLoading && !isAuthenticated && suffixReady !== false) {
      onRedirect(buildLoginRedirect(pathname, suffix));
    }
  }, [isGated, isLoading, isAuthenticated, suffixReady, onRedirect, pathname, suffix]);

  if (!isGated) return <>{children}</>;
  if (isLoading) {
    if (sessionTimedOut) return <SessionCheckTimeout onRetry={() => window.location.reload()} />;
    return <LoadingState variant="spinner" text="Verifying your session..." />;
  }
  if (!isAuthenticated) return <LoadingState variant="spinner" text="Redirecting to sign in..." />;
  return <>{children}</>;
}

/** App Router shell: gates every route under src/app via next/navigation. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const onRedirect = useCallback((path: string) => router.replace(path), [router]);

  // The query/hash part of the current URL. usePathname() strips it, and
  // reading it from window.location in an effect (rather than
  // useSearchParams in the root layout) avoids opting every route into
  // client-side rendering. The capture is keyed to the pathname it was
  // read for, and the core is told explicitly whether the suffix for
  // the CURRENT pathname is ready: React runs the child's effects
  // before this parent's, so on an initially settled logged-out session
  // the core's redirect effect would otherwise fire first with a null
  // suffix and the deep link's query/hash would never reach /login
  // (PR #961 review). With the readiness signal the first — and only —
  // redirect carries the full destination.
  const [capture, setCapture] = useState<{ forPath: string | null; suffix: string } | null>(null);
  useEffect(() => {
    setCapture({
      forPath: pathname,
      suffix: `${window.location.search}${window.location.hash}`,
    });
  }, [pathname]);

  const suffixReady = capture !== null && capture.forPath === pathname;
  const suffix = suffixReady ? capture.suffix : null;

  return (
    <AuthGateCore pathname={pathname} suffix={suffix} suffixReady={suffixReady} onRedirect={onRedirect}>
      {children}
    </AuthGateCore>
  );
}

/**
 * Honest fallback when the session check takes too long: explains what
 * happened and offers a retry instead of an infinite spinner.
 */
function SessionCheckTimeout({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center"
      role="alert"
    >
      <p className="text-base font-semibold text-[var(--quant-foreground)]">
        Taking longer than expected
      </p>
      <p className="max-w-sm text-sm text-[var(--quant-muted-foreground)]">
        We couldn&apos;t verify your session. Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-[44px] rounded-xl bg-[var(--brand-primary)] px-6 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
