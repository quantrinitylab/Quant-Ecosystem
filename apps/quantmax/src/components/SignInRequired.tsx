// ============================================================================
// QuantMax — friendly "please sign in" state.
// Rendered instead of a raw API 401 ("Missing or invalid authorization header")
// whenever a feed/query fails unauthenticated. Shows honest copy and a real
// link to /login. Auto-redirect is on by default; the public For You feed
// passes autoRedirect={false} so logged-out visitors keep a browsable page
// with a sign-in prompt instead of being bounced.
// ============================================================================
import { useEffect } from 'react';
import { useRouter } from 'next/router';

interface SignInRequiredProps {
  appName?: string;
  /** Navigate to /login after a beat. Disable on intentionally-public routes. */
  autoRedirect?: boolean;
}

export function SignInRequired({ appName = 'QuantMax', autoRedirect = true }: SignInRequiredProps) {
  const router = useRouter();
  const href = `/login?returnTo=${encodeURIComponent(router.asPath || '/')}`;

  useEffect(() => {
    if (!autoRedirect) return;
    const timer = window.setTimeout(() => {
      void router.replace(href);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [router, href, autoRedirect]);

  return (
    <div
      className="flex min-h-screen w-full flex-col items-center justify-center gap-3 bg-[var(--quant-background)] p-8 text-center"
      role="status"
      aria-live="polite"
    >
      <h1 className="text-lg font-semibold text-[var(--quant-foreground)]">
        Sign in to {appName}
      </h1>
      <p className="max-w-sm text-sm text-[var(--quant-muted-foreground)]">
        {autoRedirect
          ? 'Your session has expired or you are signed out. Please sign in with your Quant account to continue — taking you there now.'
          : 'Sign in with your Quant account to like, comment, and follow creators.'}
      </p>
      <a
        className="mt-2 min-h-[44px] rounded-lg bg-[var(--brand-primary)] px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.02] active:scale-[0.98]"
        href={href}
      >
        Go to sign in
      </a>
    </div>
  );
}
