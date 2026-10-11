'use client';

// ============================================================================
// QuantAds — sign in.
// One QuantID (the ecosystem account) signs you in across QuantAds.
// Two ways in, on this screen:
//   1. "Continue with QuantMail" — real OAuth2 (authorization-code + PKCE)
//      against QuantMail. The browser goes to QuantMail's authorize endpoint;
//      this app's /api/auth/sso/callback exchanges the code server-side and
//      mints httpOnly session cookies. No tokens ever touch the URL or JS.
//   2. Quant ID / email + password — checked by QuantMail via /api/auth/login.
// Tokens live only in httpOnly cookies (shared useAuth, cookie session mode).
// ============================================================================

import { Suspense, useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, Button, LoadingState } from '@quant/shared-ui';
import { useAuth } from '@quant/shared-ui';
import {
  startQuantMailOAuth,
  consumeSsoTicketFromUrl,
  requestPasswordReset,
  PASSWORD_RESET_SENT_COPY,
  SSO_ERROR_COPY,
} from '@quant/shared-ui';

/** Only allow same-origin, absolute-path returns so ?returnTo can't open-redirect. */
function safeReturnPath(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, completeSsoTicket, isLoading, error, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [ssoBusy, setSsoBusy] = useState(false);
  const [ssoError, setSsoError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotDone, setForgotDone] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  const returnTo = safeReturnPath(searchParams ? searchParams.get('returnTo') : null) ?? '/economy/creator';

  // SSO RETURN HANDLERS
  // Contract A failures: the callback redirects back with ?error=<code> —
  // surface the honest copy and scrub the param.
  // Contract B: QuantMail's /sso chooser hands back ?sso_ticket=. The ticket
  // is scrubbed from the URL FIRST (before any network), then verified
  // server-side via /api/auth/sso/ticket.
  //
  // NOTE: the old code captured ?token=/ ?accessToken= from the URL and wrote
  // them straight into localStorage — removed. Tokens never come via the URL
  // anymore, and JavaScript never holds them.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const errorCode = params.get('error');
    if (errorCode && SSO_ERROR_COPY[errorCode]) {
      setSsoError(SSO_ERROR_COPY[errorCode]);
      params.delete('error');
      const clean = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}${window.location.hash}`;
      window.history.replaceState({}, document.title, clean);
    }
    const ticket = consumeSsoTicketFromUrl();
    if (!ticket) return;
    let cancelled = false;
    (async () => {
      setSsoBusy(true);
      setSsoError(null);
      try {
        await completeSsoTicket(ticket);
        if (!cancelled) router.replace(returnTo);
      } catch (caught) {
        if (!cancelled) {
          setSsoError(
            caught instanceof Error ? caught.message : 'QuantMail sign-in failed. Please try again.',
          );
        }
      } finally {
        if (!cancelled) setSsoBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      router.replace(returnTo);
    }
  }, [isAuthenticated, isLoading, router, returnTo]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitting(true);
      try {
        await login(email, password);
        router.push(returnTo);
      } catch {
        // error is surfaced via useAuth().error — stay on the page.
      } finally {
        setSubmitting(false);
      }
    },
    [login, email, password, router, returnTo],
  );

  // Real "Continue with QuantMail": PKCE + state -> QuantMail authorize.
  const handleContinueWithQuantMail = useCallback(async () => {
    setSsoError(null);
    setSsoBusy(true);
    try {
      await startQuantMailOAuth({ appId: 'quantads', returnTo });
    } catch {
      setSsoBusy(false);
      setSsoError('Could not start the QuantMail sign-in. Please try again.');
    }
  }, [returnTo]);

  async function handleForgotPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setForgotError(null);
    if (!forgotEmail.trim()) {
      setForgotError('Enter your email address.');
      return;
    }
    setForgotBusy(true);
    try {
      await requestPasswordReset(forgotEmail.trim());
      setForgotDone(true);
    } catch (caught) {
      setForgotError(caught instanceof Error ? caught.message : 'Please try again later.');
    } finally {
      setForgotBusy(false);
    }
  }

  if (isAuthenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4 py-8">
        <div className="w-full max-w-md text-center">
          <p className="text-[var(--quant-foreground)]">You are signed in.</p>
          <Button variant="primary" className="mt-4" onClick={() => router.push(returnTo)}>
            Continue to QuantAds
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <Card className="p-6">
        <h1 className="text-xl font-bold mb-1">Sign in to QuantAds</h1>
        <p className="text-sm text-[var(--quant-muted-foreground)] mb-5">
          Use your QuantID — one account for the whole ecosystem.
        </p>

        {/* Real QuantMail SSO — OAuth2 code + PKCE (no tokens in the URL). */}
        <div className="mb-6">
          <button
            type="button"
            onClick={handleContinueWithQuantMail}
            disabled={ssoBusy || isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {ssoBusy ? 'Connecting to QuantMail…' : '⚡ Continue with QuantMail'}
          </button>
          {ssoError ? (
            <p role="alert" className="mt-3 text-sm text-red-500">
              {ssoError}
            </p>
          ) : null}
        </div>

        <div className="mb-6 flex items-center justify-center gap-4">
          <div className="h-px flex-1 bg-[var(--quant-border)]"></div>
          <span className="text-[11px] font-semibold tracking-wider text-[var(--quant-muted-foreground)]">
            OR WITH QUANT ID / EMAIL
          </span>
          <div className="h-px flex-1 bg-[var(--quant-border)]"></div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-xs font-medium mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--quant-background)] border border-[var(--quant-border)] text-sm min-h-[44px] focus:outline-none focus:border-[var(--quant-foreground)]"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-medium mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--quant-background)] border border-[var(--quant-border)] text-sm min-h-[44px] focus:outline-none focus:border-[var(--quant-foreground)]"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            disabled={submitting || isLoading}
          >
            {submitting || isLoading ? 'Signing in…' : 'Sign in'}
          </Button>

          <div className="text-right">
            <button
              type="button"
              onClick={() => {
                setForgotOpen((v) => !v);
                setForgotDone(false);
                setForgotError(null);
              }}
              className="text-xs font-medium text-[var(--quant-muted-foreground)] underline-offset-4 hover:underline"
            >
              Forgot password?
            </button>
          </div>

          {forgotOpen ? (
            <div className="rounded-xl border border-[var(--quant-border)] p-4">
              {forgotDone ? (
                <p role="status" className="text-sm">
                  {PASSWORD_RESET_SENT_COPY}
                </p>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-3">
                  <label htmlFor="forgot-email" className="block text-xs font-medium">
                    Email for the reset link
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="you@quantmail.in"
                    className="w-full px-3 py-2 rounded-lg bg-[var(--quant-background)] border border-[var(--quant-border)] text-sm min-h-[44px] focus:outline-none"
                  />
                  {forgotError ? (
                    <p role="alert" className="text-xs text-red-500">
                      {forgotError}
                    </p>
                  ) : null}
                  <Button type="submit" variant="primary" className="w-full" disabled={forgotBusy}>
                    {forgotBusy ? 'Sending…' : 'Email me a reset link'}
                  </Button>
                  <p className="text-xs text-[var(--quant-muted-foreground)]">
                    {PASSWORD_RESET_SENT_COPY} You&apos;ll set the new password on QuantMail.
                  </p>
                </form>
              )}
            </div>
          ) : null}
        </form>

        <p className="mt-6 text-center text-sm text-[var(--quant-muted-foreground)]">
          New to the ecosystem?{' '}
          <a
            href="https://quantmail.in/register"
            className="font-semibold text-[var(--brand-primary)] underline-offset-4 hover:underline"
          >
            Create a QuantID
          </a>
        </p>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingState text="Loading sign in…" />}>
      <LoginPageInner />
    </Suspense>
  );
}
