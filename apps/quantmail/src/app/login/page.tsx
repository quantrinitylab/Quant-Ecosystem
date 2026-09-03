'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthBrandPanel } from '../../components/auth/AuthBrandPanel';
import { AuthShell } from '../../components/auth/AuthShell';
import { PageTransition } from '@quant/shared-ui';
import { QUANT_MAIL_DOMAIN, toQuantAddress } from '../../config/identity';
import { safeReturnPath } from '../../lib/safe-return-path';
import { useAuth } from '../../providers/auth-provider';

interface LoginFieldErrors {
  identifier?: string;
  password?: string;
}

/** Printed recovery codes are `ABCDE-FGHJK`; authenticator codes are 6 digits. */
const BACKUP_CODE_LENGTH = 11;

const formatCountdown = (seconds: number): string => {
  const safe = Math.max(0, seconds);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
};

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, completeTwoFactor, cancelTwoFactor, isLoading } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  // Second-factor leg. `stage` is what the form renders; `secondsLeft` counts the
  // challenge down so the form can say why it stopped working instead of just
  // rejecting codes once the server has forgotten the attempt.
  const [stage, setStage] = useState<'credentials' | 'two-factor'>('credentials');
  const [codeMode, setCodeMode] = useState<'totp' | 'backup'>('totp');
  const [code, setCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [deadline, setDeadline] = useState<number | null>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);

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

  const destination = () => {
    // `returnTo` is what AuthGuard sends; `next` is kept for the invite link.
    const returnTo =
      safeReturnPath(searchParams?.get('returnTo')) ?? safeReturnPath(searchParams?.get('next'));
    return returnTo || '/';
  };

  const backToPassword = useCallback(
    (message: string | null) => {
      cancelTwoFactor();
      setStage('credentials');
      setCode('');
      setCodeMode('totp');
      setDeadline(null);
      setSecondsLeft(0);
      setError(message);
    },
    [cancelTwoFactor],
  );

  // Tick the challenge down, and hand the form back when it runs out. Letting the
  // code field sit there past expiry would answer a correct code with a rejection.
  useEffect(() => {
    if (stage !== 'two-factor' || deadline === null) return;

    const tick = () => {
      const remaining = Math.ceil((deadline - Date.now()) / 1000);
      setSecondsLeft(Math.max(0, remaining));
      if (remaining <= 0) {
        backToPassword('That sign-in attempt expired. Enter your password again.');
      }
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [stage, deadline, backToPassword]);

  useEffect(() => {
    if (stage === 'two-factor') codeInputRef.current?.focus();
  }, [stage]);

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
      const outcome = await login(email, password);
      if (outcome.status === 'two-factor-required') {
        // The password is no longer needed and should not sit in a controlled
        // input behind the code step.
        setPassword('');
        setDeadline(Date.now() + outcome.expiresIn * 1000);
        setSecondsLeft(outcome.expiresIn);
        setStage('two-factor');
        return;
      }
      router.push(destination());
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Sign-in failed. Try again.');
    }
  }

  async function handleCodeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmed = code.trim();
    if (!trimmed) {
      setError(
        codeMode === 'totp'
          ? 'Enter the 6-digit code from your authenticator app.'
          : 'Enter one of your recovery codes.',
      );
      return;
    }

    try {
      await completeTwoFactor(trimmed);
      router.push(destination());
    } catch (caughtError) {
      setCode('');
      codeInputRef.current?.focus();
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'That code was not accepted. Try again.',
      );
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
              {stage === 'credentials' ? 'Account access' : 'Two-factor authentication'}
            </p>
            <h1 className="text-[28px] font-semibold tracking-[-0.035em] text-[var(--quant-foreground)] sm:text-[30px]">
              {stage === 'credentials' ? 'Sign in to QuantMail' : 'Confirm it is you'}
            </h1>
            <p className="mt-2 text-sm leading-6 text-[var(--quant-muted-foreground)]">
              {stage === 'credentials'
                ? 'Use your QuantMail address or account handle.'
                : codeMode === 'totp'
                  ? 'Open your authenticator app and enter the current 6-digit code.'
                  : 'Enter one of the recovery codes you saved when you turned on two-factor authentication.'}
            </p>
          </div>

          {stage === 'credentials' && contextNotice ? (
            <div className="mb-5 rounded-xl border border-[#5C3016] bg-[#2B1A11] px-4 py-3 text-sm text-[var(--quant-foreground)]">
              {contextNotice}
            </div>
          ) : null}

          {stage === 'credentials' && successMessage ? (
            <div
              role="status"
              aria-live="polite"
              className="mb-5 rounded-xl border border-[var(--quant-success)]/30 bg-[var(--quant-success)]/10 px-4 py-3 text-sm text-[var(--quant-success)]"
            >
              {successMessage}
            </div>
          ) : null}

          {stage === 'credentials' ? (
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
          ) : (
            <form onSubmit={handleCodeSubmit} noValidate className="space-y-5">
              <div>
                <label htmlFor="login-code" className="mb-2 block text-[13px] font-medium">
                  {codeMode === 'totp' ? 'Authenticator code' : 'Recovery code'}
                </label>
                <input
                  ref={codeInputRef}
                  id="login-code"
                  name="one-time-code"
                  type="text"
                  required
                  /*
                   * One field for both kinds of code, because the server decides
                   * which it is by shape. The keyboard, the case handling and the
                   * length limit are all that change: digits only for the app,
                   * upper-case letters for the printed card.
                   */
                  inputMode={codeMode === 'totp' ? 'numeric' : 'text'}
                  autoComplete="one-time-code"
                  autoCapitalize={codeMode === 'totp' ? 'none' : 'characters'}
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={codeMode === 'totp' ? 6 : BACKUP_CODE_LENGTH}
                  placeholder={codeMode === 'totp' ? '123456' : 'ABCDE-FGHJK'}
                  value={code}
                  onChange={(event) => {
                    const raw = event.target.value;
                    setCode(
                      codeMode === 'totp'
                        ? raw.replace(/\D/g, '').slice(0, 6)
                        : raw.toUpperCase().slice(0, BACKUP_CODE_LENGTH),
                    );
                  }}
                  aria-invalid={Boolean(error)}
                  aria-describedby="login-code-hint"
                  className="w-full rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] px-3.5 py-3 text-center text-lg font-semibold tracking-[0.35em] outline-none transition-[border-color,box-shadow] placeholder:font-normal placeholder:tracking-[0.2em] placeholder:text-[var(--quant-muted-foreground)] focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/20 motion-reduce:transition-none"
                />
                <p
                  id="login-code-hint"
                  className="mt-1.5 text-xs text-[var(--quant-muted-foreground)]"
                >
                  {codeMode === 'totp'
                    ? 'Six digits, refreshed by your app every 30 seconds.'
                    : 'One of the codes you saved. Each one works once.'}
                </p>
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
                {isLoading ? 'Checking your code.' : ''}
              </p>

              <button
                type="submit"
                disabled={isLoading}
                className="auth-primary-action w-full rounded-xl border px-4 py-3 text-sm font-semibold transition-[background-color,transform,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b0d] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transform-none motion-reduce:transition-none"
              >
                {isLoading ? 'Checking…' : 'Verify and sign in'}
              </button>

              {/*
                Deliberately not a live region. It changes every second, and a
                screen reader announcing the clock over and over would bury the
                error messages that actually need to be heard. Expiry speaks for
                itself: the form returns to the password step with a `role="alert"`.
              */}
              {secondsLeft > 0 ? (
                <p className="text-center text-xs text-[var(--quant-muted-foreground)]">
                  This sign-in attempt expires in {formatCountdown(secondsLeft)}.
                </p>
              ) : null}

              <div className="flex flex-col items-center gap-1 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setCodeMode((mode) => (mode === 'totp' ? 'backup' : 'totp'));
                    setCode('');
                    setError(null);
                    codeInputRef.current?.focus();
                  }}
                  className="inline-flex min-h-[44px] items-center px-2 text-xs font-medium text-[var(--brand-primary)] underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                >
                  {codeMode === 'totp'
                    ? 'Use a recovery code instead'
                    : 'Use your authenticator app instead'}
                </button>
                <button
                  type="button"
                  onClick={() => backToPassword(null)}
                  className="inline-flex min-h-[44px] items-center px-2 text-xs font-medium text-[var(--quant-muted-foreground)] underline-offset-4 hover:text-[var(--quant-foreground)] hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                >
                  Sign in as someone else
                </button>
              </div>
            </form>
          )}

          {stage === 'credentials' ? (
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
          ) : null}
        </div>
      </AuthShell>
    </PageTransition>
  );
}
