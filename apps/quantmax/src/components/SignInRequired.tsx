// ============================================================================
// QuantMax — branded guest landing / "please sign in" state.
// Rendered instead of a raw API 401 ("Missing or invalid authorization header")
// whenever a feed/query fails unauthenticated. On the intentionally-public
// For You route (autoRedirect={false}) it doubles as the QuantMax landing
// page: real QuantMax brand mark, one truthful product line, and honest copy
// about what the app contains. No invented claims, stats, badges, pills, or
// testimonials — every word is an instruction or a provable truth.
// ============================================================================
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { appLogos } from '@quant/brand';
import { useTheme } from '../providers/theme-provider';

interface SignInRequiredProps {
  appName?: string;
  /** Navigate to /login after a beat. Disable on intentionally-public routes. */
  autoRedirect?: boolean;
}

/**
 * Truthful one-line product description.
 * Matches apps/quantmax/package.json ("Short video social, random video chat,
 * and dating platform hybrid") and the shipped pages.
 */
const PRODUCT_LINE = 'Short videos, live video chat, and dating — in one app.';

/**
 * Honest "what it is" copy. Every item maps to a shipped page in this app:
 * - For You short-video feed .......... pages/index.tsx
 * - Live / group video rooms .......... pages/live.tsx, pages/group-rooms.tsx
 * - Random video chat ................. pages/videochat.tsx
 * - Speed dating / swipe matching ..... pages/speed-dating.tsx, pages/matching.tsx
 * - Virtual date activities ........... pages/virtual-dates.tsx
 */
const WHAT_IT_IS: string[] = [
  'Swipe a For You feed of short videos',
  'Go live, join group video rooms, or start a random video chat',
  'Meet people with speed dating, swipe matching, and virtual date activities',
];

export function SignInRequired({ appName = 'QuantMax', autoRedirect = true }: SignInRequiredProps) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const href = `/login?returnTo=${encodeURIComponent(router.asPath || '/')}`;
  // First-party brand constant (not user input) — safe to inline.
  const logoSvg = appLogos.quantmax[resolvedTheme === 'dark' ? 'dark' : 'light'];

  useEffect(() => {
    if (!autoRedirect) return;
    const timer = window.setTimeout(() => {
      void router.replace(href);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [router, href, autoRedirect]);

  return (
    <div
      className="flex min-h-screen w-full flex-col items-center justify-center bg-[var(--quant-background)] px-4 py-12 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="w-full max-w-md">
        {/* Brand mark — the official QuantMax logo lockup from @quant/brand */}
        <div
          className="mx-auto mb-5 flex justify-center [&>svg]:h-12 [&>svg]:w-auto"
          role="img"
          aria-label={`${appName} logo`}
          dangerouslySetInnerHTML={{ __html: logoSvg }}
        />
        <h1 className="sr-only">{appName}</h1>
        <p className="text-base font-semibold text-[var(--quant-foreground)] sm:text-lg">
          {PRODUCT_LINE}
        </p>
        {!autoRedirect && (
          <ul className="mx-auto mt-5 max-w-sm space-y-2.5 text-left">
            {WHAT_IT_IS.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2.5 text-sm text-[var(--quant-muted-foreground)]"
              >
                <span aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--brand-primary)]">
                  &#9679;
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mx-auto mt-5 max-w-sm text-sm text-[var(--quant-muted-foreground)]">
          {autoRedirect
            ? 'Your session has expired or you are signed out. Please sign in with your Quant account to continue — taking you there now.'
            : 'Sign in with your Quant account to like, comment, and follow creators.'}
        </p>
        <a
          className="mt-6 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[var(--brand-primary)] px-6 py-3 text-sm font-bold text-white transition-transform hover:scale-[1.02] active:scale-[0.98] sm:w-auto"
          href={href}
        >
          <span>&#9889; Continue with Quant Account</span>
        </a>
      </div>
    </div>
  );
}
