'use client';

// ============================================================================
// QuantMail Executive Sovereign Sign-In
// Superhuman / Linear / Google Workspace Executive Sovereign Parity
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { QUANT_MAIL_DOMAIN, toQuantAddress } from '../../config/identity';
import { safeReturnPath } from '../../lib/safe-return-path';
import { useAuth } from '../../providers/auth-provider';
import { browserAuthSession } from '../../services/browser-auth-session';
import { handoffToExternalDestination } from './sso-handoff';
import { TwoFactorRecoveryPanel } from './two-factor-recovery-panel';

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

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    user,
    isAuthenticated,
    login,
    completeTwoFactor,
    cancelTwoFactor,
    completeNewDeviceChallenge,
    cancelNewDeviceChallenge,
    resendNewDeviceChallenge,
    isLoading,
  } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});

  // Second-factor leg, plus the new-device email-code leg
  const [stage, setStage] = useState<'credentials' | 'two-factor' | 'new-device' | 'recovery'>(
    'credentials',
  );
  const [newDeviceEmail, setNewDeviceEmail] = useState('');
  const [newDeviceDestination, setNewDeviceDestination] = useState('');
  // 'primary' = the code went to the account inbox itself (no verified
  // recovery email on file). That user must read it on a device where they
  // are already signed in — this browser cannot open the inbox until the
  // code is entered — so the copy below says so explicitly.
  const [newDeviceChannel, setNewDeviceChannel] = useState<'recovery' | 'primary' | null>(null);
  const [codeMode, setCodeMode] = useState<'totp' | 'backup'>('totp');
  const [code, setCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [deadline, setDeadline] = useState<number | null>(null);
  // Post-recovery notice shown on the credentials stage after 2FA is turned off.
  const [notice, setNotice] = useState<string | null>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);

  const successMessage = searchParams?.get('success');
  const switchTo = searchParams?.get('switch_to') ?? null;
  const isAddingAccount = searchParams?.get('add_account') === 'true';

  const contextNotice = switchTo
    ? `Switching to ${switchTo}. Enter the password for that account.`
    : isAddingAccount
      ? 'Adding another account. Sign in with the address you want to add.'
      : null;

  // Prefill once, and only while the field is untouched
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !switchTo) return;
    prefilled.current = true;
    setIdentifier(switchTo);
  }, [switchTo]);

  const rawReturnTo = searchParams?.get('returnTo');
  useEffect(() => {
    if (isAuthenticated && !isLoading && rawReturnTo) {
      const safe = safeReturnPath(rawReturnTo);
      if (safe && (safe.startsWith('http://') || safe.startsWith('https://'))) {
        router.replace(`/sso?returnTo=${encodeURIComponent(rawReturnTo)}`);
      }
    }
  }, [isAuthenticated, isLoading, rawReturnTo, router]);

  const destination = useCallback(() => {
    const returnTo =
      safeReturnPath(searchParams?.get('returnTo')) ?? safeReturnPath(searchParams?.get('next'));
    return returnTo || '/';
  }, [searchParams]);

  // External-destination handoff after sign-in.
  //
  // SECURITY: the raw session access token NEVER travels in the redirect URL
  // (browser history, server access logs, Referer headers). We mint a
  // short-lived single-use opaque SSO ticket server-side (the bearer token
  // goes in the Authorization header of that POST only), and the URL carries
  // ONLY `?__quant_sso_ticket=<ticket>`. The receiving app's backend resolves
  // the ticket server-side and establishes its own session. On mint failure
  // we show an honest error — there is no fallback that puts the token back
  // in the URL.
  const navigateToDestination = useCallback(async () => {
    const dest = destination();
    if (dest.startsWith('http://') || dest.startsWith('https://')) {
      await handoffToExternalDestination(dest, browserAuthSession.getAccessToken(), (url) => {
        window.location.href = url;
      }, setError);
      return;
    }
    router.push(dest);
  }, [destination, router]);

  const backToPassword = useCallback(
    (message: string | null) => {
      cancelTwoFactor();
      cancelNewDeviceChallenge();
      setNewDeviceChannel(null);
      setStage('credentials');
      setCode('');
      setCodeMode('totp');
      setDeadline(null);
      setSecondsLeft(0);
      setError(message);
    },
    [cancelTwoFactor, cancelNewDeviceChallenge],
  );

  // Recovery finished: 2FA is off, no session was issued — drop the stale
  // challenge and land on the credentials stage so the user signs in with
  // the password, then re-enrols a fresh authenticator behind a fresh session.
  const finishRecovery = useCallback(
    (message: string) => {
      cancelTwoFactor();
      setStage('credentials');
      setCode('');
      setCodeMode('totp');
      setDeadline(null);
      setSecondsLeft(0);
      setError(null);
      setNotice(message);
    },
    [cancelTwoFactor],
  );

  useEffect(() => {
    if ((stage !== 'two-factor' && stage !== 'new-device') || deadline === null) return;

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
    if (stage === 'two-factor' || stage === 'new-device') codeInputRef.current?.focus();
  }, [stage]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const errors: LoginFieldErrors = {};
    if (!identifier.trim()) errors.identifier = 'Enter your email address.';
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
        setPassword('');
        setDeadline(Date.now() + outcome.expiresIn * 1000);
        setSecondsLeft(outcome.expiresIn);
        setStage('two-factor');
        return;
      }
      if (outcome.status === 'new-device-required') {
        // This browser is new to the account: the password was right, but
        // the session waits on the emailed code. The code is redeemable
        // only from this device, so the form stays put — no navigation.
        setPassword('');
        setNewDeviceEmail(email);
        setNewDeviceDestination(outcome.maskedDestination);
        setNewDeviceChannel(outcome.channel);
        setDeadline(Date.now() + outcome.expiresIn * 1000);
        setSecondsLeft(outcome.expiresIn);
        setStage('new-device');
        return;
      }
      navigateToDestination();
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
        stage === 'new-device'
          ? 'Enter the 6-digit code we emailed you.'
          : codeMode === 'totp'
            ? 'Enter the 6-digit code from your authenticator app.'
            : 'Enter one of your recovery codes.',
      );
      return;
    }

    try {
      if (stage === 'new-device') {
        await completeNewDeviceChallenge(newDeviceEmail, trimmed);
      } else {
        await completeTwoFactor(trimmed);
      }
      navigateToDestination();
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : 'That code was not accepted. Try again.';
      const errorCode =
        typeof caughtError === 'object' && caughtError !== null && 'code' in caughtError
          ? String((caughtError as { code?: unknown }).code ?? '')
          : '';

      if (
        errorCode === 'CHALLENGE_EXPIRED' ||
        errorCode === 'SESSION_INITIALIZATION_FAILED' ||
        errorCode === 'NEW_DEVICE_MISMATCH' ||
        errorCode === 'INVALID_OR_EXPIRED_CODE' ||
        errorCode === 'CODE_ALREADY_USED' ||
        errorCode === 'TOO_MANY_ATTEMPTS' ||
        errorCode === 'NO_PENDING_CHALLENGE'
      ) {
        backToPassword(message);
        return;
      }

      setCode('');
      codeInputRef.current?.focus();
      setError(message);
    }
  }

  async function handleResendNewDeviceCode() {
    setError(null);
    try {
      await resendNewDeviceChallenge(newDeviceEmail);
      setDeadline(Date.now() + 15 * 60 * 1000);
      setSecondsLeft(15 * 60);
      setNotice(`A new code was sent to ${newDeviceDestination}.`);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'We could not send a new code.',
      );
    }
  }

  return (
    <div>
      {/* The recovery panel renders its own heading. */}
      {stage !== 'recovery' ? (
        <div className="mb-7">
          <h1 className="text-2xl sm:text-[28px] font-semibold tracking-[-0.03em] text-white">
            {stage === 'credentials' ? (
              <>
                Sign in to{' '}
                <span className="signin-wordmark" aria-label="QuantMail">
                  <span className="wm-quant">Quant</span>
                  <span className="wm-mail">Mail</span>
                </span>
              </>
            ) : (
              'Confirm your identity'
            )}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            {stage === 'credentials'
              ? 'Enter your email address and password.'
              : stage === 'new-device'
                ? `This device is new to your account, so we sent a 6-digit code to ${newDeviceDestination}. Enter it to finish signing in.${newDeviceChannel === 'primary' ? ' Open the code on a device where you are already signed in — this browser cannot open your inbox until the code is entered.' : ''}`
                : codeMode === 'totp'
                  ? 'Open your authenticator app and enter the current 6-digit code.'
                  : 'Enter one of the recovery codes saved during two-factor setup.'}
          </p>
        </div>
      ) : null}

      {stage === 'credentials' && contextNotice ? (
        <div className="mb-5 rounded-xl border border-[var(--quant-primary)]/30 bg-[var(--quant-primary)]/10 shadow-[0_0_16px_rgba(255,140,66,0.1),inset_0_1px_0_0_rgba(255,255,255,0.06)] px-4 py-3 text-sm text-[var(--brand-accent)]">
          {contextNotice}
        </div>
      ) : null}

      {stage === 'credentials' && successMessage ? (
        <div
          role="status"
          aria-live="polite"
          className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400"
        >
          {successMessage}
        </div>
      ) : null}

      {(stage === 'credentials' || stage === 'new-device') && notice ? (
        <div
          role="status"
          aria-live="polite"
          className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400"
        >
          {notice}
        </div>
      ) : null}

      {stage === 'credentials' ? (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="login-id" className="text-[13px] font-medium text-zinc-300">
                Email address
              </label>
            </div>
            <input
              id="login-id"
              type="email"
              required
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={`you@${QUANT_MAIL_DOMAIN}`}
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              aria-invalid={Boolean(fieldErrors.identifier)}
              aria-describedby={fieldErrors.identifier ? 'login-id-error' : undefined}
              className={`w-full rounded-xl border bg-[var(--quant-surface)] px-3.5 py-3 text-sm text-white placeholder:text-zinc-500 outline-none transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] focus:border-[var(--quant-primary)] focus:ring-2 focus:ring-[var(--quant-primary)]/20 motion-reduce:transition-none ${
                fieldErrors.identifier ? 'border-red-500/50' : 'border-white/[0.08]'
              }`}
            />
            {fieldErrors.identifier ? (
              <p id="login-id-error" className="mt-1.5 text-xs text-red-400">
                {fieldErrors.identifier}
              </p>
            ) : null}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="login-password" className="text-[13px] font-medium text-zinc-300">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="-my-3.5 -mr-2 inline-flex items-center px-2 py-3.5 text-xs font-medium text-[var(--quant-primary)] underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
              >
                Forgot password?
              </Link>
            </div>
            <div
              className={`flex overflow-hidden rounded-xl border bg-[var(--quant-surface)] transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] focus-within:border-[var(--quant-primary)] focus-within:ring-2 focus-within:ring-[var(--quant-primary)]/20 motion-reduce:transition-none ${
                fieldErrors.password ? 'border-red-500/50' : 'border-white/[0.08]'
              }`}
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
                className="min-w-0 flex-1 bg-transparent px-3.5 py-3 text-sm text-white outline-none placeholder:text-zinc-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="px-3.5 text-xs font-semibold text-zinc-400 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--quant-primary)]"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {fieldErrors.password ? (
              <p
                id="login-password-error"
                className="mt-1.5 text-xs text-red-400"
              >
                {fieldErrors.password}
              </p>
            ) : null}
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 flex items-center gap-2"
            >
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          ) : null}

          <p className="sr-only" role="status" aria-live="polite">
            {isLoading ? 'Signing in.' : ''}
          </p>

          <button
            type="submit"
            disabled={isLoading}
            className="auth-primary-action w-full rounded-xl border px-4 py-3 text-sm font-semibold transition-[background-color,transform,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b0d] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transform-none motion-reduce:transition-none"
          >
            {isLoading ? 'Authenticating…' : 'Sign in'}
          </button>
        </form>
      ) : stage === 'recovery' ? (
        <TwoFactorRecoveryPanel
          accountEmail={identifier}
          onBackToChallenge={() => {
            setError(null);
            setStage('two-factor');
          }}
          onRecovered={finishRecovery}
        />
      ) : (
        <form onSubmit={handleCodeSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="login-code" className="mb-2 block text-[13px] font-medium text-zinc-300">
              {stage === 'new-device'
                ? 'Sign-in code'
                : codeMode === 'totp'
                  ? 'Authenticator code'
                  : 'Recovery code'}
            </label>
            <input
              ref={codeInputRef}
              id="login-code"
              name="one-time-code"
              type="text"
              required
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
              className="w-full rounded-xl border border-white/[0.08] bg-[var(--quant-surface)]/90 px-3.5 py-3 text-center text-lg font-semibold tracking-[0.35em] text-white outline-none transition-all placeholder:font-normal placeholder:tracking-[0.2em] placeholder:text-zinc-600 focus:border-[var(--quant-primary)] focus:ring-2 focus:ring-[var(--quant-primary)]/20 font-mono shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]"
            />
            <p
              id="login-code-hint"
              className="mt-1.5 text-xs text-zinc-500 font-mono"
            >
              {stage === 'new-device'
                ? 'Six digits from the email we just sent. It works only on this device.'
                : codeMode === 'totp'
                  ? 'Six digits, refreshed by your app every 30 seconds.'
                  : 'One of the codes you saved. Each one works once.'}
            </p>
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 flex items-center gap-2"
            >
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
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
            {isLoading ? 'Verifying…' : 'Verify and sign in'}
          </button>

          {secondsLeft > 0 ? (
            <p className="text-center text-xs text-zinc-500 font-mono">
              This sign-in attempt expires in {formatCountdown(secondsLeft)}.
            </p>
          ) : null}

          <div className="flex flex-col items-center gap-1 pt-1">
            {stage === 'new-device' ? (
              <button
                type="button"
                onClick={handleResendNewDeviceCode}
                className="inline-flex min-h-[44px] items-center px-2 text-xs font-medium text-[var(--quant-primary)] underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
              >
                Send a new code
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setStage('recovery');
                  }}
                  className="inline-flex min-h-[44px] items-center px-2 text-xs font-medium text-[var(--quant-primary)] underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
                >
                  Can&apos;t use your authenticator?
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCodeMode((mode) => (mode === 'totp' ? 'backup' : 'totp'));
                    setCode('');
                    setError(null);
                    codeInputRef.current?.focus();
                  }}
                  className="inline-flex min-h-[44px] items-center px-2 text-xs font-medium text-[var(--quant-primary)] underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
                >
                  {codeMode === 'totp'
                    ? 'Use a recovery code instead'
                    : 'Use your authenticator app instead'}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => backToPassword(null)}
              className="inline-flex min-h-[44px] items-center px-2 text-xs font-medium text-zinc-400 underline-offset-4 hover:text-white hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
            >
              Sign in as someone else
            </button>
          </div>
        </form>
      )}

      {stage === 'credentials' ? (
        <p className="mt-7 text-center text-sm text-zinc-400">
          New to QuantMail?{' '}
          <Link
            href="/register"
            className="-my-3.5 inline-flex items-center px-1.5 py-3.5 font-semibold text-[var(--quant-primary)] underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
          >
            Create an address
          </Link>
        </p>
      ) : null}

      {/* Minimal legal footer — no marketing claims */}
      <nav aria-label="Legal" className="auth-legal-footer">
        <Link href="/help">Help</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </nav>
    </div>
  );
}
