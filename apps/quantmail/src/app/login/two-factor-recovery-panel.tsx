'use client';

// ============================================================================
// Two-factor recovery panel — lost-authenticator entry point
// (fix/qm-2fa-challenge-recovery-link, queue 2026-10-18 P1 [auth-sso] [ui])
//
// The backend recovery API (POST /auth/2fa/recover + POST /auth/2fa/recover/
// confirm) existed with no UI path: the 2FA challenge screen only offered the
// code box, so a locked-out user (lost phone AND lost backup codes) sat at a
// dead prompt. This panel is the "Can't use your authenticator?" recovery
// screen, wired to the real endpoints — no fake data anywhere.
//
// Honest-copy rules this panel follows:
//   * The request endpoint is deliberately non-committal (anti-enumeration):
//     it never says whether the account exists or a code was mailed. The
//     panel echoes the server's neutral message verbatim — never promises
//     "a code was sent to your inbox".
//   * The code goes to the VERIFIED recovery address only, never the primary
//     inbox — the panel says exactly that, so the user checks the right mail.
//   * The confirm endpoint issues NO session. The panel says so and sends the
//     user back to the password sign-in afterwards.
// ============================================================================

import { useState } from 'react';
import { browserAuthSession } from '../../services/browser-auth-session';

export type RecoveryStep = 'request' | 'confirm' | 'done';

interface TwoFactorRecoveryPanelProps {
  /** The account address the user already typed on the sign-in screen (may be empty). */
  accountEmail: string;
  /** Back to the authenticator/backup-code challenge screen. */
  onBackToChallenge: () => void;
  /** Recovery completed: hand the success message back to the sign-in screen. */
  onRecovered: (message: string) => void;
  /** Test seam only: render a later step statically. */
  initialStep?: RecoveryStep;
}

const errorAlert = (message: string) => (
  <div
    role="alert"
    className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 flex items-center gap-2"
  >
    <svg
      className="w-4 h-4 flex-shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
    <span>{message}</span>
  </div>
);

export function TwoFactorRecoveryPanel({
  accountEmail,
  onBackToChallenge,
  onRecovered,
  initialStep = 'request',
}: TwoFactorRecoveryPanelProps) {
  const [step, setStep] = useState<RecoveryStep>(initialStep);
  const [email, setEmail] = useState(accountEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const failureMessage = (response: { error?: { message?: string } }): string =>
    response.error?.message ?? 'Something went wrong. Try again.';

  async function handleRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Enter the email address on your account.');
      return;
    }
    setIsLoading(true);
    try {
      const response = await browserAuthSession.requestTwoFactorRecovery(trimmed);
      if (!response.success) {
        setError(failureMessage(response));
        return;
      }
      // Echo the backend's neutral copy verbatim: it deliberately says
      // nothing about whether an account matched or a code was mailed.
      setInfo(
        response.data?.message ??
          'If this account has two-factor on and a verified recovery email, a code is on its way.',
      );
      setStep('confirm');
    } catch {
      setError('Could not reach the authentication service. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResend() {
    setError(null);
    setInfo(null);
    setIsLoading(true);
    try {
      const response = await browserAuthSession.requestTwoFactorRecovery(email.trim());
      if (!response.success) {
        setError(failureMessage(response));
        return;
      }
      setInfo(response.data?.message ?? null);
    } catch {
      setError('Could not reach the authentication service. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleConfirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    if (!code.trim()) {
      setError('Enter the 6-digit code from the recovery email.');
      return;
    }
    if (!password) {
      setError('Enter your account password.');
      return;
    }
    setIsLoading(true);
    try {
      const response = await browserAuthSession.confirmTwoFactorRecovery(
        email.trim(),
        password,
        code.trim(),
      );
      if (!response.success) {
        setError(failureMessage(response));
        setCode('');
        return;
      }
      setStep('done');
    } catch {
      setError('Could not reach the authentication service. Check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-7">
        <h1 className="text-2xl sm:text-[28px] font-semibold tracking-[-0.03em] text-white">
          Recover sign-in access
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Lost your authenticator and your recovery codes? We&apos;ll send a one-time code to
          the verified recovery email on this account — not to your QuantMail inbox. You
          still need your account password.
        </p>
      </div>

      {step === 'request' ? (
        <form onSubmit={handleRequest} noValidate className="space-y-4">
          <div>
            <label htmlFor="recovery-email" className="mb-2 block text-[13px] font-medium text-zinc-300">
              Account email
            </label>
            <input
              id="recovery-email"
              type="email"
              required
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@quantmail.in"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={Boolean(error)}
              className={`w-full rounded-xl border bg-[var(--quant-surface)]/90 backdrop-blur px-3.5 py-3 text-sm text-white placeholder:text-zinc-500 outline-none transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] focus:border-[var(--quant-primary)] focus:ring-2 focus:ring-[var(--quant-primary)]/20 motion-reduce:transition-none ${
                error ? 'border-red-500/50' : 'border-white/[0.08]'
              }`}
            />
            <p className="mt-1.5 text-xs text-zinc-500">
              The code goes only to the recovery address you verified in Settings.
            </p>
          </div>

          {error ? errorAlert(error) : null}

          <p className="sr-only" role="status" aria-live="polite">
            {isLoading ? 'Sending the recovery code.' : ''}
          </p>

          <button
            type="submit"
            disabled={isLoading}
            className="auth-primary-action w-full rounded-xl border px-4 py-3 text-sm font-semibold transition-[background-color,transform,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b0d] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transform-none motion-reduce:transition-none"
          >
            {isLoading ? 'Sending…' : 'Send recovery code'}
          </button>
        </form>
      ) : null}

      {step === 'confirm' ? (
        <form onSubmit={handleConfirm} noValidate className="space-y-4">
          {info ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400"
            >
              {info}
            </div>
          ) : null}

          <div>
            <label htmlFor="recovery-code" className="mb-2 block text-[13px] font-medium text-zinc-300">
              Recovery code
            </label>
            <input
              id="recovery-code"
              name="one-time-code"
              type="text"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              aria-invalid={Boolean(error)}
              className="w-full rounded-xl border border-white/[0.08] bg-[var(--quant-surface)]/90 px-3.5 py-3 text-center text-lg font-semibold tracking-[0.35em] text-white outline-none transition-all placeholder:font-normal placeholder:tracking-[0.2em] placeholder:text-zinc-600 focus:border-[var(--quant-primary)] focus:ring-2 focus:ring-[var(--quant-primary)]/20 font-mono shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]"
            />
            <p className="mt-1.5 text-xs text-zinc-500 font-mono">
              Six digits from the recovery email. Expires in 15 minutes, works once.
            </p>
          </div>

          <div>
            <label htmlFor="recovery-password" className="mb-2 block text-[13px] font-medium text-zinc-300">
              Account password
            </label>
            <div
              className={`flex overflow-hidden rounded-xl border bg-[var(--quant-surface)]/90 backdrop-blur transition-all shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)] focus-within:border-[var(--quant-primary)] focus-within:ring-2 focus-within:ring-[var(--quant-primary)]/20 motion-reduce:transition-none ${
                error ? 'border-red-500/50' : 'border-white/[0.08]'
              }`}
            >
              <input
                id="recovery-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={Boolean(error)}
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
          </div>

          {error ? errorAlert(error) : null}

          <p className="sr-only" role="status" aria-live="polite">
            {isLoading ? 'Turning off two-factor.' : ''}
          </p>

          <button
            type="submit"
            disabled={isLoading}
            className="auth-primary-action w-full rounded-xl border px-4 py-3 text-sm font-semibold transition-[background-color,transform,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b0d] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transform-none motion-reduce:transition-none"
          >
            {isLoading ? 'Working…' : 'Turn off two-factor'}
          </button>

          <div className="flex flex-col items-center gap-1 pt-1">
            <button
              type="button"
              onClick={handleResend}
              disabled={isLoading}
              className="inline-flex min-h-[44px] items-center px-2 text-xs font-medium text-[var(--quant-primary)] underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] disabled:opacity-60"
            >
              Didn&apos;t get the code? Send it again
            </button>
          </div>
        </form>
      ) : null}

      {step === 'done' ? (
        <div className="space-y-4">
          <div
            role="status"
            aria-live="polite"
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400"
          >
            Two-factor authentication is off. Sign in with your password, then set up a new
            authenticator in Settings → Security.
          </div>
          <button
            type="button"
            onClick={() =>
              onRecovered(
                'Two-factor authentication is off. Sign in with your password.',
              )
            }
            className="auth-primary-action w-full rounded-xl border px-4 py-3 text-sm font-semibold transition-[background-color,transform,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b0d] active:translate-y-px motion-reduce:transform-none motion-reduce:transition-none"
          >
            Back to sign in
          </button>
        </div>
      ) : null}

      <div className="flex flex-col items-center gap-1 pt-1">
        <button
          type="button"
          onClick={onBackToChallenge}
          className="inline-flex min-h-[44px] items-center px-2 text-xs font-medium text-zinc-400 underline-offset-4 hover:text-white hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
        >
          Back to authenticator code
        </button>
      </div>
    </div>
  );
}
