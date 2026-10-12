'use client';

// ============================================================================
// QuantAI — login gate (App Router).
// Unauthenticated visitors are sent to /login instead of a permanently-loading
// shell. Waits for the initial session-restore before deciding, so a returning
// user with a valid refresh cookie is never bounced; /login is public so the
// redirect can't loop.
//
// F-205 fix: SSO-handoff detection uses exact URLSearchParams key matching
// (isSsoHandoffUrl), not the old `search.includes('token=')` substring
// heuristic, which false-positived on unrelated query values and stranded
// visitors on the "redirecting" screen by skipping the /login redirect.
// ============================================================================
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../providers/auth-provider';
import { AuthPending } from '@quant/shared-ui';
import { isSsoHandoffUrl } from '../lib/sso-handoff';

const PUBLIC_ROUTES = new Set<string>(['/login', '/']);

/**
 * If the guard issued the /login redirect but navigation never happened
 * (wedged router, chunk failure, JS error), the visitor would otherwise sit
 * on the "Taking you to sign in" screen forever while the copy claims a
 * redirect is in flight. After this long we escalate to an honest stranded
 * state with a real, prominent same-origin link — the guard class can never
 * strand a visitor on a silent redirect screen again.
 */
const REDIRECT_STALL_MS = 10_000;

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const isPublic = pathname ? PUBLIC_ROUTES.has(pathname) : false;
  const [redirectIssued, setRedirectIssued] = useState(false);
  const [redirectStalled, setRedirectStalled] = useState(false);

  useEffect(() => {
    if (isLoading || isPublic || isAuthenticated) return;
    if (typeof window !== 'undefined' && isSsoHandoffUrl(window.location.search)) {
      // A real SSO ticket/token is in the URL: let the AuthProvider mount
      // effect ingest it without flashing /login.
      return;
    }
    const returnTo = encodeURIComponent(pathname ?? '/');
    router.replace(`/login?returnTo=${returnTo}`);
    setRedirectIssued(true);
  }, [isLoading, isPublic, isAuthenticated, pathname, router]);

  useEffect(() => {
    if (!redirectIssued || isAuthenticated) return;
    const timer = window.setTimeout(() => setRedirectStalled(true), REDIRECT_STALL_MS);
    return () => window.clearTimeout(timer);
  }, [redirectIssued, isAuthenticated]);

  if (isPublic) return <>{children}</>;
  // Never `return null` here: a blank 200 is indistinguishable from a dead app
  // to a monitor, and if the client-side redirect below never runs the visitor
  // is stranded on an empty page. AuthPending always renders text and a real
  // link to /login.
  if (isLoading) return <AuthPending state="verifying" loginPath="/login" />;
  if (!isAuthenticated) {
    if (redirectStalled) {
      // The redirect was issued but never fired: be honest about it and make
      // the manual path unmissable. Dark UI per the standing standard.
      const returnTo = encodeURIComponent(pathname ?? '/');
      return (
        <div
          className="flex min-h-dvh w-full flex-col items-center justify-center gap-3 bg-[var(--quant-background)] p-8 text-center"
          role="alert"
          aria-live="assertive"
        >
          <h1 className="text-lg font-semibold text-[var(--quant-foreground)]">
            Sign in to QuantAI
          </h1>
          <p className="max-w-sm text-sm text-[var(--quant-muted-foreground)]">
            We couldn&rsquo;t take you to the sign-in page automatically. Continue below — your
            destination is saved and we&rsquo;ll bring you back after you sign in.
          </p>
          <a
            className="mt-2 min-h-[44px] rounded-lg bg-[var(--quant-accent)] px-6 py-3 text-sm font-semibold text-[var(--quant-on-accent,#ffffff)] underline-offset-4 focus:outline-none focus:ring-2 focus:ring-[var(--quant-foreground)]"
            href={`/login?returnTo=${returnTo}`}
          >
            Go to sign in
          </a>
        </div>
      );
    }
    return <AuthPending state="redirecting" loginPath="/login" appName="QuantAI" />;
  }
  return <>{children}</>;
}
