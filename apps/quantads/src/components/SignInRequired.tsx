'use client';

// ============================================================================
// QuantAds — friendly "please sign in" state.
// Rendered instead of a raw API 401 ("Missing or invalid authorization header")
// whenever a dashboard query fails unauthenticated — e.g. an expired token
// mid-session. Shows honest copy, a real link to the sign-in page (preserving
// the current path as returnTo), and gently navigates there after a beat so a
// logged-out visitor is never stranded on an infinite skeleton or a dead end.
// ============================================================================
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

interface SignInRequiredProps {
  appName?: string;
  loginPath?: string;
}

export function SignInRequired({ appName = 'QuantAds', loginPath = '/auth/login' }: SignInRequiredProps) {
  const pathname = usePathname();
  const safePath = pathname && pathname.startsWith('/') && !pathname.startsWith('//') ? pathname : '/';
  const href = `${loginPath}?returnTo=${encodeURIComponent(safePath)}`;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.location.assign(href);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [href]);

  return (
    <div
      className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-3 p-8 text-center"
      role="status"
      aria-live="polite"
    >
      <h2 className="text-lg font-semibold text-[var(--quant-foreground)]">
        Sign in to {appName}
      </h2>
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
