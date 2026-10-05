// ============================================================================
// QuantCooks — sign in.
// One QuantID (the ecosystem account) signs you in across QuantCooks. Password is
// checked by the identity service via the /auth proxy; a second factor, if the
// account has one, is completed on QuantMail and then this session is restored.
// ============================================================================
import { useCallback, useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../providers/auth-provider';

/** Only allow same-origin, absolute-path returns so ?returnTo can't open-redirect. */
function safeReturnPath(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [twoFactorNotice, setTwoFactorNotice] = useState(false);

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

  const handleQuantSSO = useCallback(() => {
    const target = destination();
    const returnParam = target && target !== '/' ? `?returnTo=${encodeURIComponent(target)}` : '';
    const returnTo = encodeURIComponent(`${window.location.origin}/login${returnParam}`);
    window.location.href = `https://quantmail.in/sso?returnTo=${returnTo}&client_id=quantcooks`;
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
            Sign in to QuantCooks
          </h1>
          <p className="mt-2 text-sm text-[var(--quant-muted-foreground)]">
            Use your QuantID — one account for the whole ecosystem.
          </p>
        </div>

        <div className="mb-6">
          <a
            href={`https://quantmail.in/sso?returnTo=${encodeURIComponent(typeof window !== 'undefined' ? `${window.location.origin}${destination()}` : 'https://quantcooks.quantrinity.in/')}`}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            ⚡ Continue with Quant Account
          </a>
        </div>

        <div className="mb-6 flex items-center justify-center gap-4">
          <div className="h-px flex-1 bg-[var(--quant-border)]"></div>
          <span className="text-[11px] font-semibold tracking-wider text-[var(--quant-muted-foreground)]">
            OR WITH QUANT ID / EMAIL
          </span>
          <div className="h-px flex-1 bg-[var(--quant-border)]"></div>
        </div>

        {twoFactorNotice ? (
          <div
            role="status"
            className="mb-5 rounded-xl border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/10 px-4 py-3 text-sm text-[var(--quant-foreground)]"
          >
            This account uses two-factor authentication. Finish signing in on QuantMail, then reopen
            QuantCooks — your session carries over.
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
            className="w-full rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] px-4 py-3 text-sm font-medium text-[var(--quant-foreground)] transition hover:bg-[var(--quant-muted)]/20 active:translate-y-px"
          >
            ⚡ Continue with Quant SSO
          </button>
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
