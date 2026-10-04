// ============================================================================
// QuantCooks — friendly "please sign in" state.
// Rendered instead of a raw API 401 ("Missing or invalid authorization header")
// whenever a page query fails unauthenticated — e.g. an expired token
// mid-session, or a stale deploy without the AuthGuard. Shows honest copy, a
// real link to /login (preserving the current path as returnTo), and gently
// navigates there after a beat so the visitor is never stranded on an infinite
// skeleton or a dead end.
// ============================================================================
import { useEffect } from 'react';
import { useRouter } from 'next/router';

export function SignInRequired({ appName = 'QuantCooks' }: { appName?: string }) {
  const router = useRouter();
  const href = `/login?returnTo=${encodeURIComponent(router.asPath || '/')}`;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void router.replace(href);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [router, href]);

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
        Your session has expired or you are signed out. Please sign in with your Quant account to
        continue — taking you there now.
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
