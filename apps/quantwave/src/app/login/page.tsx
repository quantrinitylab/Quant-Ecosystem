'use client';

// ============================================================================
// QuantWave — sign in.
// One QuantID (the ecosystem account) signs you in across QuantWave. Password is
// checked by the identity service via the /auth proxy; a second factor, if the
// account has one, is completed on QuantMail and then this session is restored.
// "Continue with Quant SSO" goes out to QuantMail's /sso and comes back here
// with the session token in the URL — the callback effect below exchanges it
// for a QuantWave session (completeSSO), strips the token from the address
// bar, and continues to ?returnTo.
// ============================================================================
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../providers/auth-provider';

/** Only allow same-origin, absolute-path returns so ?returnTo can't open-redirect. */
function safeReturnPath(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

/**
 * URL params QuantMail's /sso handoff uses to deliver the session token.
 * Read in priority order — `__quant_sso_ticket` is the current handoff param,
 * `token`/`accessToken`/`access_token` are legacy aliases.
 */
const SSO_TOKEN_PARAMS = ['__quant_sso_ticket', 'token', 'accessToken', 'access_token'] as const;

function readSsoToken(searchParams: { get: (name: string) => string | null } | null): string | null {
  if (!searchParams) return null;
  for (const key of SSO_TOKEN_PARAMS) {
    const value = searchParams.get(key);
    if (value && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Scrub the handoff token out of the address bar so the credential never
 * lingers in the URL or browser history (history.replaceState keeps the
 * navigation entry intact without a reload).
 */
function stripSsoTokenFromUrl(): void {
  try {
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of SSO_TOKEN_PARAMS) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    if (changed) {
      const clean = url.pathname + (url.search ? `?${url.searchParams.toString()}` : '') + url.hash;
      window.history.replaceState(null, '', clean);
    }
  } catch {
    // Never break navigation because the URL could not be rewritten.
  }
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, ssoLogin, isLoading, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [twoFactorNotice, setTwoFactorNotice] = useState(false);
  const [ssoBusy, setSsoBusy] = useState(false);
  // Dedupes the exchange across StrictMode double-mounts and re-renders.
  const ssoConsumedRef = useRef<string | null>(null);

  const destination = useCallback(
    () => safeReturnPath(searchParams?.get('returnTo') ?? null) ?? '/',
    [searchParams],
  );

  // Auto-redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      router.replace(destination());
    }
  }, [isAuthenticated, isLoading, router, destination]);

  // SSO callback handler: QuantMail redirects back here after the user
  // approves "Continue with Quant SSO", carrying the session token in the
  // URL. Exchange it for a QuantWave session, strip it from the address bar,
  // then continue to the destination.
  useEffect(() => {
    const ssoToken = readSsoToken(searchParams);
    if (!ssoToken || ssoConsumedRef.current === ssoToken) return;
    ssoConsumedRef.current = ssoToken;
    (async () => {
      if (isAuthenticated && !isLoading) {
        stripSsoTokenFromUrl();
        router.replace(destination());
        return;
      }
      setSsoBusy(true);
      setError(null);
      try {
        await ssoLogin(ssoToken);
        stripSsoTokenFromUrl();
        router.replace(destination());
      } catch {
        stripSsoTokenFromUrl();
        setError('Quant Account sign-in failed. Please try again or sign in with your password.');
      } finally {
        setSsoBusy(false);
      }
    })();
  }, [searchParams, isAuthenticated, isLoading, ssoLogin, router, destination]);

  const handleQuantSSO = useCallback(() => {
    const target = destination();
    const returnParam = target && target !== '/' ? `?returnTo=${encodeURIComponent(target)}` : '';
    const returnTo = encodeURIComponent(`${window.location.origin}/login${returnParam}`);
    window.location.href = `https://quantmail.in/sso?returnTo=${returnTo}&client_id=quantwave`;
  }, [destination]);

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
      router.push(destination());
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
            Sign in to QuantWave
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
            QuantWave — your session carries over.
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
            <div className="flex overflow-hidden rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] transition-[border-color,box-shadow] focus-within:border-[var(--brand-primary)] focus-within:ring-2 focus-within:ring-[var(--brand-primary)]/20">
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

          <div className="relative my-4 flex items-center justify-center">
            <div className="w-full border-t border-[var(--quant-border)]" />
            <span className="absolute bg-[var(--quant-background)] px-2 text-xs uppercase tracking-wider text-[var(--quant-muted-foreground)]">
              or
            </span>
          </div>

          <button
            type="button"
            onClick={handleQuantSSO}
            disabled={ssoBusy || isLoading}
            className="w-full rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] px-4 py-3 text-sm font-medium text-[var(--quant-foreground)] transition hover:bg-[var(--quant-muted)]/20 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
          >
            {ssoBusy ? 'Connecting your Quant Account…' : '⚡ Continue with Quant SSO'}
          </button>
          {ssoBusy ? (
            <p role="status" className="text-center text-xs text-[var(--quant-muted-foreground)]">
              Finishing the sign-in from QuantMail…
            </p>
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

// useSearchParams() must sit under a Suspense boundary or `next build` fails
// static generation for this route.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
