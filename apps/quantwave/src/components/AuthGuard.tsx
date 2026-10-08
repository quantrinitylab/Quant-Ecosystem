'use client';

// ============================================================================
// QuantWave — login gate (App Router).
// Unauthenticated visitors are sent to /login instead of a permanently-loading
// shell. Waits for the initial session-restore before deciding, so a returning
// user with a valid refresh cookie is never bounced; /login is public so the
// redirect can't loop.
// ============================================================================
import { useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../providers/auth-provider';
import { AuthPending } from '@quant/shared-ui';

const PUBLIC_ROUTES = new Set<string>(['/login']);

/**
 * Quant Account SSO entry point — the same URL the /login page's
 * "Continue with Quant SSO" button navigates to. QuantMail completes the
 * sign-in there and redirects back to QuantWave's /login with the session
 * token, which the SSO return handler there consumes.
 */
const SSO_BASE = 'https://quantmail.in/sso';

/** Build the real SSO URL for this visitor, preserving the ?returnTo= path. */
function buildSsoUrl(pathname: string | null): string | null {
  if (typeof window === 'undefined') return null;
  const target =
    pathname && pathname.startsWith('/') && !pathname.startsWith('//') ? pathname : '/';
  const returnParam = target !== '/' ? `?returnTo=${encodeURIComponent(target)}` : '';
  const returnTo = encodeURIComponent(`${window.location.origin}/login${returnParam}`);
  return `${SSO_BASE}?returnTo=${returnTo}&client_id=quantwave`;
}

/**
 * Signed-out holding state that never dead-ends (QM-UIUX-003). It starts the
 * real Quant Account SSO flow programmatically shortly after mounting, and
 * always offers a working primary CTA that performs the same redirect on tap
 * (covers navigation blocked, back-button returns, or JS-assisted redirects
 * that never run). The /login link remains as a last resort — that page is a
 * real, working sign-in form, not another holding screen.
 */
function SsoPendingRedirect({ pathname }: { pathname: string | null }) {
  const ssoUrl = useMemo(() => buildSsoUrl(pathname), [pathname]);

  // Preferred path: actually start the SSO flow instead of describing it.
  useEffect(() => {
    if (!ssoUrl) return;
    const timer = window.setTimeout(() => {
      window.location.assign(ssoUrl);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [ssoUrl]);

  const goToSso = () => {
    if (ssoUrl) window.location.assign(ssoUrl);
  };

  return (
    <div
      className="flex min-h-dvh w-full flex-col items-center justify-center gap-3 bg-[var(--quant-background)] p-8 text-center"
      role="status"
      aria-live="polite"
    >
      <h1 className="text-lg font-semibold text-[var(--quant-foreground)]">Sign in to QuantWave</h1>
      <p className="max-w-sm text-sm text-[var(--quant-muted-foreground)]">
        Taking you to sign in with your Quant account.
      </p>
      <button
        type="button"
        onClick={goToSso}
        className="mt-2 min-h-[48px] rounded-xl bg-[var(--brand-primary)] px-6 py-3 text-sm font-semibold text-white transition-[opacity,transform] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!ssoUrl}
      >
        Continue with Quant Account
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
  if (isLoading) return <AuthPending state="verifying" loginPath="/login" />;
  // Signed out: drive the real SSO flow instead of sitting on a static page.
  // The router.replace above is kept as a first attempt (it lands on /login,
  // which holds the same working SSO button); SsoPendingRedirect starts the
  // actual SSO navigation if the in-app redirect never completes.
  if (!isAuthenticated) return <SsoPendingRedirect pathname={pathname} />;
  return <>{children}</>;
}

