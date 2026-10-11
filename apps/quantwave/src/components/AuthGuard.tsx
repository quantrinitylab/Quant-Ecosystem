'use client';

// ============================================================================
// QuantWave — login gate (App Router).
// Unauthenticated visitors are sent to /login instead of a permanently-loading
// shell. Waits for the initial session-restore before deciding, so a returning
// user with a valid refresh cookie is never bounced; /login is public so the
// redirect can't loop.
// ============================================================================
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../providers/auth-provider';
import { AuthPending, startQuantMailOAuth } from '@quant/shared-ui';

const PUBLIC_ROUTES = new Set<string>(['/login']);

/**
 * Signed-out holding state that never dead-ends (QM-UIUX-003). It starts the
 * REAL QuantMail OAuth2 flow (PKCE + state -> authorize -> server-side code
 * exchange) programmatically shortly after mounting, and always offers a
 * working primary CTA that performs the same start on tap (covers navigation
 * blocked, back-button returns, or JS-assisted redirects that never run).
 * The /login link remains as a last resort — that page is a real, working
 * sign-in form, not another holding screen.
 */
function SsoPendingRedirect({ pathname }: { pathname: string | null }) {
  const [ssoFailed, setSsoFailed] = useState(false);
  const returnTo = useMemo(
    () => (pathname && pathname.startsWith('/') && !pathname.startsWith('//') ? pathname : '/'),
    [pathname],
  );

  const beginSso = useMemo(() => {
    let started = false;
    return () => {
      if (started) return;
      started = true;
      startQuantMailOAuth({ appId: 'quantwave', returnTo }).catch(() => setSsoFailed(true));
    };
  }, [returnTo]);

  // Preferred path: actually start the SSO flow instead of describing it.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      beginSso();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [beginSso]);

  return (
    <div
      className="flex min-h-dvh w-full flex-col items-center justify-center gap-3 bg-[var(--quant-background)] p-8 text-center"
      role="status"
      aria-live="polite"
    >
      <h1 className="text-lg font-semibold text-[var(--quant-foreground)]">Sign in to QuantWave</h1>
      <p className="max-w-sm text-sm text-[var(--quant-muted-foreground)]">
        {ssoFailed
          ? 'Could not start the QuantMail sign-in. Please try again or use the sign-in page.'
          : 'Taking you to sign in with your QuantMail account.'}
      </p>
      <button
        type="button"
        onClick={beginSso}
        className="mt-2 min-h-[48px] rounded-xl bg-[var(--brand-primary)] px-6 py-3 text-sm font-semibold text-white transition-[opacity,transform] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
      >
        Continue with QuantMail
      </button>
      <a
        className="min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium text-[var(--quant-foreground)] underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-[var(--quant-foreground)]"
        href="/login"
      >
        Go to sign in
      </a>
    </div>
  );
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const isPublic = pathname ? PUBLIC_ROUTES.has(pathname) : false;

  useEffect(() => {
    if (isLoading || isPublic || isAuthenticated) return;
    const returnTo = encodeURIComponent(pathname ?? '/');
    router.replace(`/login?returnTo=${returnTo}`);
  }, [isLoading, isPublic, isAuthenticated, pathname, router]);

  if (isPublic) return <>{children}</>;
  // Never `return null` here: a blank 200 is indistinguishable from a dead app
  // to a monitor, and if the client-side redirect below never runs the visitor
  // is stranded on an empty page. AuthPending always renders text and a real
  // link to /login.
  // Fail-safe (R3-P1-6): even if the provider's session restore wedges,
  // `verifying` flips to an honest "sign in to continue" screen with a
  // working login link after 10s — never a permanent black interstitial.
  if (isLoading) return <AuthPending state="verifying" loginPath="/login" appName="QuantWave" timeoutMs={10000} />;
  // Signed out: drive the real SSO flow instead of sitting on a static page.
  // The router.replace above is kept as a first attempt (it lands on /login,
  // which holds the same working SSO button); SsoPendingRedirect starts the
  // actual SSO navigation if the in-app redirect never completes.
  if (!isAuthenticated) return <SsoPendingRedirect pathname={pathname} />;
  return <>{children}</>;
}

