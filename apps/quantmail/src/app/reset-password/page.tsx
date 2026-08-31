'use client';

/**
 * Set a new password from an emailed link.
 *
 * The other half of `/forgot-password`, which has existed and worked since before
 * there was a backend behind it. Three things this screen has to get right that a
 * plain form does not:
 *
 * 1. A dead link is a different outcome from a bad password. `INVALID_TOKEN` and
 *    `RESET_LINK_EXPIRED` end the attempt and offer a new link; `WEAK_PASSWORD`
 *    keeps the form up with the reason on the field.
 * 2. The server's message is rendered verbatim. The rule that governs a password
 *    lives in `backend/lib/password-reset.ts`, and paraphrasing it here is how a
 *    form ends up arguing with the thing it submits to.
 * 3. A reset issues no session on purpose — control of a mailbox is not the
 *    second factor. So success routes to `/login` rather than to the inbox.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AuthBrandPanel } from '../../components/auth/AuthBrandPanel';
import { AuthShell } from '../../components/auth/AuthShell';
import {
  MIN_PASSWORD_LENGTH,
  PasswordStrengthMeter,
  structuralComplaint,
} from '../../components/auth/PasswordStrengthMeter';
import { PageTransition } from '../../components/PageTransition';
import { apiClient } from '../../services/api-client';

/** The codes that mean the link itself is finished, not the password. */
const DEAD_LINK_CODES = new Set(['INVALID_TOKEN', 'RESET_LINK_EXPIRED']);

type Stage = 'form' | 'done';

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  // Null only while prerendering, which is why a missing token is not an error
  // yet: the static HTML would otherwise ship the "broken link" panel and correct
  // itself on hydration.
  const token = searchParams?.get('token')?.trim() ?? '';
  const isReadingLink = searchParams === null;

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deadLink, setDeadLink] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stage, setStage] = useState<Stage>('form');

  const matches = useMemo(
    () => Boolean(confirmPassword) && confirmPassword === password,
    [confirmPassword, password],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const complaint = password ? structuralComplaint(password) : 'Choose a new password.';
    const mismatch = confirmPassword ? null : 'Re-enter your new password.';
    setPasswordError(complaint);
    setConfirmError(mismatch ?? (matches ? null : 'Passwords do not match.'));
    if (complaint || mismatch || !matches) return;

    setIsSubmitting(true);
    const response = await apiClient.resetPassword(token, password);
    setIsSubmitting(false);

    if (response.success) {
      // Nothing sensitive survives the transition, and no session was issued.
      setPassword('');
      setConfirmPassword('');
      setStage('done');
      return;
    }

    const code = response.error?.code ?? '';
    const message = response.error?.message ?? '';

    if (code === 'NETWORK_ERROR') {
      setFormError('We could not reach QuantMail. Check your connection and try again.');
      return;
    }
    if (DEAD_LINK_CODES.has(code)) {
      setDeadLink(message || 'This reset link is no longer valid.');
      return;
    }
    if (code === 'WEAK_PASSWORD' || code === 'VALIDATION_ERROR') {
      setPasswordError(message || 'Choose a different password.');
      return;
    }
    setFormError(message || 'Something went wrong. Request a new link and try again.');
  }

  const brand = (
    <AuthBrandPanel
      eyebrow="Account recovery"
      title="Pick something only you know."
      subtitle="Setting a new password signs out every device that was already signed in."
    />
  );

  /* One target, one place: the three end states all send you here or to /login. */
  const newLinkLink = (
    <Link
      href="/forgot-password"
      className="mt-5 inline-flex min-h-[44px] items-center text-sm font-semibold text-[var(--brand-primary)] underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
    >
      Request a new link
    </Link>
  );

  return (
    <PageTransition>
      <AuthShell brand={brand}>
        <div>
          <div className="mb-8">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-primary)]">
              Account recovery
            </p>
            <h1 className="text-[28px] font-semibold tracking-[-0.035em] text-[var(--quant-foreground)] sm:text-[30px]">
              {stage === 'done' ? 'Password updated' : 'Set a new password'}
            </h1>
            <p className="mt-2 text-sm leading-6 text-[var(--quant-muted-foreground)]">
              {stage === 'done'
                ? 'Sign in with your new password. Every other session has been signed out.'
                : `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters. The link works once.`}
            </p>
          </div>

          {stage === 'done' ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded-2xl border border-[var(--quant-success)]/30 bg-[var(--quant-success)]/10 p-5"
            >
              <h2 className="text-sm font-semibold text-[var(--quant-foreground)]">
                You can sign in now
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--quant-muted-foreground)]">
                Your password has been changed and the reset link is spent. If you use an
                authenticator, it is unchanged — you will still be asked for a code.
              </p>
              <Link
                href="/login"
                className="mt-5 inline-flex min-h-[44px] items-center text-sm font-semibold text-[var(--brand-primary)] underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
              >
                Continue to sign in
              </Link>
            </div>
          ) : isReadingLink ? (
            <p className="text-sm text-[var(--quant-muted-foreground)]">Checking your link…</p>
          ) : deadLink ? (
            <div
              role="alert"
              className="rounded-2xl border border-[var(--quant-destructive)]/30 bg-[var(--quant-destructive)]/10 p-5"
            >
              <h2 className="text-sm font-semibold text-[var(--quant-foreground)]">
                This link has expired
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--quant-muted-foreground)]">
                {deadLink} Reset links last 60 minutes and work once. Requesting another one is
                free.
              </p>
              {newLinkLink}
            </div>
          ) : !token ? (
            <div
              role="alert"
              className="rounded-2xl border border-[var(--quant-destructive)]/30 bg-[var(--quant-destructive)]/10 p-5"
            >
              <h2 className="text-sm font-semibold text-[var(--quant-foreground)]">
                This link is incomplete
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--quant-muted-foreground)]">
                The address is missing its reset token. Mail clients sometimes break long links
                across lines — open the link from the email again, or request a new one.
              </p>
              {newLinkLink}
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <div>
                <label htmlFor="new-password" className="mb-2 block text-[13px] font-medium">
                  New password
                </label>
                <div
                  className={`flex overflow-hidden rounded-xl border bg-[var(--quant-surface)] transition-[border-color,box-shadow] focus-within:border-[var(--brand-primary)] focus-within:ring-2 focus-within:ring-[var(--brand-primary)]/20 motion-reduce:transition-none ${passwordError ? 'border-[var(--quant-destructive)]' : 'border-[var(--quant-border)]'}`}
                >
                  <input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    autoFocus
                    placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setPasswordError(null);
                    }}
                    aria-invalid={Boolean(passwordError)}
                    aria-describedby="new-password-help"
                    className="min-w-0 flex-1 bg-transparent px-3.5 py-3 text-sm outline-none placeholder:text-[var(--quant-muted-foreground)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
                    aria-pressed={showPassword}
                    className="px-3.5 text-xs font-semibold text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-primary)]"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <PasswordStrengthMeter
                  password={password}
                  id="new-password-help"
                  error={passwordError}
                  hint="Length beats punctuation. A phrase you can remember is stronger than a short password with symbols in it."
                />
              </div>

              <div>
                <label htmlFor="confirm-password" className="mb-2 block text-[13px] font-medium">
                  Confirm new password
                </label>
                <input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  placeholder="Re-enter your new password"
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                    setConfirmError(null);
                  }}
                  aria-invalid={Boolean(confirmError)}
                  aria-describedby={confirmError ? 'confirm-password-error' : undefined}
                  className={`w-full rounded-xl border bg-[var(--quant-surface)] px-3.5 py-3 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-[var(--quant-muted-foreground)] focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/20 motion-reduce:transition-none ${confirmError ? 'border-[var(--quant-destructive)]' : 'border-[var(--quant-border)]'}`}
                />
                {confirmError ? (
                  <p
                    id="confirm-password-error"
                    className="mt-1.5 text-xs text-[var(--quant-destructive)]"
                  >
                    {confirmError}
                  </p>
                ) : confirmPassword ? (
                  <p
                    className={`mt-1.5 flex items-center gap-1.5 text-xs ${matches ? 'text-[var(--quant-success)]' : 'text-[var(--quant-muted-foreground)]'}`}
                  >
                    {matches ? (
                      <>
                        <svg
                          className="size-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Passwords match
                      </>
                    ) : (
                      'Keep typing — the two do not match yet.'
                    )}
                  </p>
                ) : null}
              </div>

              {formError ? (
                <div
                  role="alert"
                  className="rounded-xl border border-[var(--quant-destructive)]/30 bg-[var(--quant-destructive)]/10 px-4 py-3 text-sm text-[var(--quant-destructive)]"
                >
                  {formError}
                </div>
              ) : null}

              <p className="sr-only" role="status" aria-live="polite">
                {isSubmitting ? 'Setting your new password.' : ''}
              </p>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-[var(--brand-primary)] px-4 py-3 text-sm font-semibold text-[#111111] shadow-[0_10px_30px_rgba(255,140,66,0.2)] transition-[background-color,transform,box-shadow] hover:bg-[var(--brand-primary-hover)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transform-none motion-reduce:transition-none"
              >
                {isSubmitting ? 'Updating password…' : 'Set new password'}
              </button>

              <p className="text-center text-xs leading-5 text-[var(--quant-muted-foreground)]">
                Changing your password signs out every device. Your authenticator app and recovery
                codes are not affected.
              </p>
            </form>
          )}

          {stage === 'done' ? null : (
            <p className="mt-7 text-center text-sm text-[var(--quant-muted-foreground)]">
              Remembered it after all?{' '}
              <Link
                href="/login"
                /* Padding for a 44px hit area, negative margin so the line keeps its height. */
                className="-my-3.5 inline-flex items-center px-1.5 py-3.5 font-semibold text-[var(--brand-primary)] underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
              >
                Sign in
              </Link>
            </p>
          )}
        </div>
      </AuthShell>
    </PageTransition>
  );
}
