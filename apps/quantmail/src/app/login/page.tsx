'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthBrandPanel } from '../../components/auth/AuthBrandPanel';
import { AuthShell } from '../../components/auth/AuthShell';
import { PageTransition } from '../../components/PageTransition';
import { QUANT_MAIL_DOMAIN, toQuantAddress } from '../../config/identity';
import { safeReturnPath } from '../../lib/safe-return-path';
import { useAuth } from '../../providers/auth-provider';

interface LoginFieldErrors {
  identifier?: string;
  password?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isLoading } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});

  const successMessage = searchParams?.get('success');
  /*
   * The account menu and the invite page both send you here with state in the
   * URL that nothing read: `switch_to` and `add_account` from AccountBadge, and
   * `next` from an invite link. So "Switch account" landed on an empty form with
   * no clue which account it wanted, and signing in from an invite dropped you
   * at the inbox instead of the invitation you had been sent.
   */
  const switchTo = searchParams?.get('switch_to') ?? null;
  const isAddingAccount = searchParams?.get('add_account') === 'true';

  const contextNotice = switchTo
    ? `Switching to ${switchTo}. Enter the password for that account.`
    : isAddingAccount
      ? 'Adding another account. Sign in with the address you want to add.'
      : null;

  // Prefill once, and only while the field is untouched, so a later render
  // cannot overwrite an address someone has started correcting by hand.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !switchTo) return;
    prefilled.current = true;
    setIdentifier(switchTo);
  }, [switchTo]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const errors: LoginFieldErrors = {};
    if (!identifier.trim()) errors.identifier = 'Enter your address or handle.';
    if (!password) errors.password = 'Enter your password.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const trimmedIdentifier = identifier.trim();
    const email = trimmedIdentifier.includes('@')
      ? trimmedIdentifier
      : toQuantAddress(trimmedIdentifier);

    try {
      await login(email, password);
      // `returnTo` is what AuthGuard sends; `next` is kept for the invite link.
      const returnTo =
        safeReturnPath(searchParams?.get('returnTo')) ?? safeReturnPath(searchParams?.get('next'));
      router.push(returnTo || '/');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Sign-in failed. Try again.');
    }
  }

  return (
    <PageTransition>
      <AuthShell
        brand={
          <AuthBrandPanel
            eyebrow="Return to your workspace"
            title="Your work, back in focus."
            subtitle="Open your mail workspace with threads, schedules, and assisted drafting kept in one clear flow."
          />
        }
      >
        <div>
          <div className="mb-8">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-primary)]">
              Account access
            </p>
            <h1 className="text-[28px] font-semibold tracking-[-0.035em] text-[var(--quant-foreground)] sm:text-[30px]">
              Sign in to QuantMail
            </h1>
            <p className="mt-2 text-sm leading-6 text-[var(--quant-muted-foreground)]">
              Use your QuantMail address or account handle.
            </p>
          </div>

          {contextNotice ? (
            <div className="mb-5 rounded-xl border border-[#5C3016] bg-[#2B1A11] px-4 py-3 text-sm text-[var(--quant-foreground)]">
              {contextNotice}
            </div>
          ) : null}

          {successMessage ? (
            <div
              role="status"
              aria-live="polite"
              className="mb-5 rounded-xl border border-[var(--quant-success)]/30 bg-[var(--quant-success)]/10 px-4 py-3 text-sm text-[var(--quant-success)]"
            >
              {successMessage}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <label htmlFor="login-id" className="mb-2 block text-[13px] font-medium">
                Address or handle
              </label>
              <input
                id="login-id"
                type="text"
                required
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={`you@${QUANT_MAIL_DOMAIN}`}
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                aria-invalid={Boolean(fieldErrors.identifier)}
                aria-describedby={fieldErrors.identifier ? 'login-id-error' : 'login-id-hint'}
                className={`w-full rounded-xl border bg-[var(--quant-surface)] px-3.5 py-3 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-[var(--quant-muted-foreground)] focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/20 motion-reduce:transition-none ${fieldErrors.identifier ? 'border-[var(--quant-destructive)]' : 'border-[var(--quant-border)]'}`}
              />
              {fieldErrors.identifier ? (
                <p id="login-id-error" className="mt-1.5 text-xs text-[var(--quant-destructive)]">
                  {fieldErrors.identifier}
                </p>
              ) : (
                <p
                  id="login-id-hint"
                  className="mt-1.5 text-xs text-[var(--quant-muted-foreground)]"
                >
                  A full address or the handle before @{QUANT_MAIL_DOMAIN}.
                </p>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="login-password" className="text-[13px] font-medium">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  /*
                   * 103x16 before. Padding grows the hit area to 44px and the
                   * matching negative margin keeps the label row its original
                   * height, so the target is finger-sized without the field
                   * moving down the screen.
                   */
                  className="-my-3.5 -mr-2 inline-flex items-center px-2 py-3.5 text-xs font-medium text-[var(--brand-primary)] underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                >
                  Forgot password?
                </Link>
              </div>
              <div
                className={`flex overflow-hidden rounded-xl border bg-[var(--quant-surface)] transition-[border-color,box-shadow] focus-within:border-[var(--brand-primary)] focus-within:ring-2 focus-within:ring-[var(--brand-primary)]/20 motion-reduce:transition-none ${fieldErrors.password ? 'border-[var(--quant-destructive)]' : 'border-[var(--quant-border)]'}`}
              >
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
                  className="min-w-0 flex-1 bg-transparent px-3.5 py-3 text-sm outline-none placeholder:text-[var(--quant-muted-foreground)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="px-3.5 text-xs font-semibold text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-primary)]"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {fieldErrors.password ? (
                <p
                  id="login-password-error"
                  className="mt-1.5 text-xs text-[var(--quant-destructive)]"
                >
                  {fieldErrors.password}
                </p>
              ) : null}
            </div>

            {error ? (
              <div
                role="alert"
                className="rounded-xl border border-[var(--quant-destructive)]/30 bg-[var(--quant-destructive)]/10 px-4 py-3 text-sm text-[var(--quant-destructive)]"
              >
                {error}
              </div>
            ) : null}

            <p className="sr-only" role="status" aria-live="polite">
              {isLoading ? 'Signing in.' : ''}
            </p>

            {/*
              The label is the target — clicking the text toggles the box — and it
              was 20px tall. `w-fit` keeps it from spanning the form width, so the
              row is a 44px target rather than a full-width strip that toggles
              "keep me signed in" on any stray tap beside it.
            */}
            <label className="flex w-fit min-h-[44px] cursor-pointer items-center gap-2.5 sm:min-h-0">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--quant-border)] accent-[var(--brand-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b0c]"
              />
              <span className="text-sm text-[var(--quant-muted-foreground)]">
                Keep me signed in
              </span>
            </label>

            <button
              type="submit"
              disabled={isLoading}
              className="auth-primary-action w-full rounded-xl border px-4 py-3 text-sm font-semibold transition-[background-color,transform,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b0d] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transform-none motion-reduce:transition-none"
            >
              {isLoading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-7 text-center text-sm text-[var(--quant-muted-foreground)]">
            New to QuantMail?{' '}
            <Link
              href="/register"
              /* 123x17 before — same padding/negative-margin pair as Forgot password. */
              className="-my-3.5 inline-flex items-center px-1.5 py-3.5 font-semibold text-[var(--brand-primary)] underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
            >
              Create an address
            </Link>
          </p>
        </div>
      </AuthShell>
    </PageTransition>
  );
}
