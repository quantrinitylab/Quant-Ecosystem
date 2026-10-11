// ===========================================================================
// QuantMax — sign in.
// One QuantID (the ecosystem account) signs you in across QuantMax.
// Two ways in, on this screen:
//   1. "Continue with QuantMail" — real OAuth2 (authorization-code + PKCE)
//      against QuantMail. The browser goes to QuantMail's authorize endpoint;
//      this app's /api/auth/sso/callback exchanges the code server-side and
//      mints httpOnly session cookies. No tokens ever touch the URL or JS.
//   2. Username/password — checked by the identity service via the /auth proxy.
// A second factor, if the account has one, is completed on QuantMail.
// ===========================================================================
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../providers/auth-provider';
import { authSession } from '../services/auth-session';
import {
  startQuantMailOAuth,
  consumeSsoTicketFromUrl,
  safeReturnPath,
  requestPasswordReset,
  PASSWORD_RESET_SENT_COPY,
  SSO_ERROR_COPY,
} from '@quant/shared-ui';

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading, isAuthenticated, refreshSession } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [twoFactorNotice, setTwoFactorNotice] = useState(false);
  const [ssoBusy, setSsoBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotDone, setForgotDone] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  const destination = useCallback(
    () => safeReturnPath(router.query.returnTo) ?? '/',
    [router.query.returnTo],
  );

  // Auto-redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      void router.replace(destination());
    }
  }, [isAuthenticated, isLoading, router, destination]);

  // SSO RETURN HANDLERS
  // Contract A failures: the callback redirects back with ?error=<code> —
  // surface the honest copy and scrub the param.
  // Contract B: QuantMail's /sso chooser hands back ?sso_ticket=. The ticket
  // is scrubbed from the URL FIRST (before any network), then verified
  // server-side via /api/auth/sso/ticket.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const errorCode = params.get('error');
    if (errorCode && SSO_ERROR_COPY[errorCode]) {
      setError(SSO_ERROR_COPY[errorCode]);
      params.delete('error');
      const clean = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}${window.location.hash}`;
      window.history.replaceState({}, document.title, clean);
    }
    const ticket = consumeSsoTicketFromUrl();
    if (!ticket) return;
    let cancelled = false;
    (async () => {
      setSsoBusy(true);
      setError(null);
      try {
        const session = await authSession.completeSsoTicket(ticket);
        if (!session.success || !session.data?.user) {
          throw new Error(session.error?.message ?? 'QuantMail sign-in failed.');
        }
        await refreshSession();
        if (!cancelled) void router.replace(destination());
      } catch (caught) {
        if (!cancelled) {
          setError(
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

  // Real "Continue with QuantMail": PKCE + state -> QuantMail authorize.
  const handleContinueWithQuantMail = useCallback(async () => {
    setError(null);
    setSsoBusy(true);
    try {
      await startQuantMailOAuth({ appId: 'quantmax', returnTo: destination() });
    } catch {
      setSsoBusy(false);
      setError('Could not start the QuantMail sign-in. Please try again.');
    }
  }, [destination]);

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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setTwoFactorNotice(false);

    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }

    try {
      const outcome = await login(email.trim(), password);
      if (outcome.status === 'two-factor-required') {
        setPassword('');
        setTwoFactorNotice(true);
        return;
      }
      void router.push(destination());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in failed. Try again.');
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[var(--quant-background)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand-primary)] text-lg font-bold text-white">
            Q
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--quant-foreground)]">
            Sign in to QuantMax
          </h1>
          <p className="mt-2 text-sm text-[var(--quant-muted-foreground)]">
            Use your QuantID — one account for the whole ecosystem.
          </p>
        </div>

        {twoFactorNotice ? (
          <div
            role="status"
            className="mb-5 rounded-xl border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/10 px-4 py-3 text-sm text-[var(--quant-foreground)]"
          >
            This account uses two-factor authentication. Finish signing in on QuantMail, then reopen
            QuantMax — your session carries over.
          </div>
        ) : null}

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
        </div>

        <div className="mb-6 flex items-center justify-center gap-4">
          <div className="h-px flex-1 bg-[var(--quant-border)]"></div>
          <span className="text-[11px] font-semibold tracking-wider text-[var(--quant-muted-foreground)]">
            OR WITH QUANT ID / EMAIL
          </span>
          <div className="h-px flex-1 bg-[var(--quant-border)]"></div>
        </div>

        {ssoBusy && !twoFactorNotice ? (
          <div
            role="status"
            className="mb-5 rounded-xl border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/10 px-4 py-3 text-sm text-[var(--quant-foreground)]"
          >
            Completing QuantMail sign-in…
          </div>
        ) : null}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label
              htmlFor="login-email"
              className="mb-1.5 block text-[13px] font-medium text-[var(--quant-foreground)]"
            >
              Email
            </label>
            <input
              id="login-email"
              type="email"
              required
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@quantmail.in"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] px-3.5 py-3 text-sm text-[var(--quant-foreground)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--quant-muted-foreground)] focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/20"
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="mb-1.5 block text-[13px] font-medium text-[var(--quant-foreground)]"
            >
              Password
            </label>
            <div className="flex overflow-hidden rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] transition-[border-color,box-shadow] focus-within:border-[var(--brand-primary)] focus-within:ring-2 focus:ring-[var(--brand-primary)]/20">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-w-0 flex-1 bg-transparent px-3.5 py-3 text-sm text-[var(--quant-foreground)] outline-none placeholder:text-[var(--quant-muted-foreground)]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="px-3.5 text-xs font-semibold text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-[var(--quant-destructive)]/30 bg-[var(--quant-destructive)]/10 px-4 py-3 text-sm text-[var(--quant-destructive)]"
            >
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-[var(--brand-primary)] px-4 py-3 text-sm font-semibold text-white transition-[opacity,transform] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? 'Signing in…' : 'Sign in'}
          </button>

          <div className="text-right">
            <button
              type="button"
              onClick={() => {
                setForgotOpen((v) => !v);
                setForgotDone(false);
                setForgotError(null);
              }}
              className="text-xs font-medium text-[var(--quant-muted-foreground)] underline-offset-4 hover:text-[var(--quant-foreground)] hover:underline"
            >
              Forgot password?
            </button>
          </div>

          {forgotOpen ? (
            <div className="rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-4">
              {forgotDone ? (
                <p role="status" className="text-sm text-[var(--quant-foreground)]">
                  {PASSWORD_RESET_SENT_COPY}
                </p>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-3">
                  <label
                    htmlFor="forgot-email"
                    className="block text-[13px] font-medium text-[var(--quant-foreground)]"
                  >
                    Email for the reset link
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@quantmail.in"
                    value={forgotEmail}
                    onChange={(event) => setForgotEmail(event.target.value)}
                    className="w-full rounded-xl border border-[var(--quant-border)] bg-[var(--quant-background)] px-3.5 py-2.5 text-sm text-[var(--quant-foreground)] outline-none placeholder:text-[var(--quant-muted-foreground)] focus:border-[var(--brand-primary)]"
                  />
                  {forgotError ? (
                    <p role="alert" className="text-xs text-[var(--quant-destructive)]">
                      {forgotError}
                    </p>
                  ) : null}
                  <button
                    type="submit"
                    disabled={forgotBusy}
                    className="w-full rounded-xl border border-[var(--quant-border)] px-4 py-2.5 text-sm font-medium text-[var(--quant-foreground)] transition hover:bg-[var(--quant-muted)]/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {forgotBusy ? 'Sending…' : 'Email me a reset link'}
                  </button>
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
      </div>
    </div>
  );
}
