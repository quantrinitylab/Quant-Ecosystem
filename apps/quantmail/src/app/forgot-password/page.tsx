'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AuthBrandPanel } from '../../components/auth/AuthBrandPanel';
import { AuthShell } from '../../components/auth/AuthShell';
import { PageTransition } from '../../components/PageTransition';
import { QUANT_MAIL_DOMAIN } from '../../config/identity';
import { apiClient } from '../../services/api-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailError(null);
    setRequestError(null);

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setEmailError('Enter your QuantMail address.');
      return;
    }

    setIsSubmitting(true);
    const response = await apiClient.requestPasswordReset(normalizedEmail);
    setIsSubmitting(false);

    if (!response.success && response.error?.code === 'NETWORK_ERROR') {
      setRequestError('We could not reach QuantMail. Check your connection and try again.');
      return;
    }

    setIsComplete(true);
  }

  return (
    <PageTransition>
      <AuthShell
        brand={
          <AuthBrandPanel
            eyebrow="Account recovery"
            title="A calm path back in."
            subtitle="Request a password reset without exposing whether an address is registered."
          />
        }
      >
        <div>
          <div className="mb-8">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-primary)]">
              Account recovery
            </p>
            <h1 className="text-[28px] font-semibold tracking-[-0.035em] text-[var(--quant-foreground)] sm:text-[30px]">
              Reset your password
            </h1>
            <p className="mt-2 text-sm leading-6 text-[var(--quant-muted-foreground)]">
              Enter your full QuantMail address to request reset instructions.
            </p>
          </div>

          {isComplete ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded-2xl border border-[var(--quant-success)]/30 bg-[var(--quant-success)]/10 p-5"
            >
              <h2 className="text-sm font-semibold text-[var(--quant-foreground)]">
                Check your inbox
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--quant-muted-foreground)]">
                If an eligible account matches that address, password reset instructions will be
                sent. We do not confirm whether an account exists.
              </p>
              <Link
                href="/login"
                /* The only way forward from the sent-confirmation state, so it gets a real target. */
                className="mt-5 inline-flex min-h-[44px] items-center text-sm font-semibold text-[var(--brand-primary)] underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
              >
                Return to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <div>
                <label htmlFor="reset-email" className="mb-2 block text-[13px] font-medium">
                  QuantMail address
                </label>
                <input
                  id="reset-email"
                  type="email"
                  required
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={`you@${QUANT_MAIL_DOMAIN}`}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={Boolean(emailError)}
                  aria-describedby={emailError ? 'reset-email-error' : 'reset-email-hint'}
                  className={`w-full rounded-xl border bg-[var(--quant-surface)] px-3.5 py-3 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-[var(--quant-muted-foreground)] focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/20 motion-reduce:transition-none ${emailError ? 'border-[var(--quant-destructive)]' : 'border-[var(--quant-border)]'}`}
                />
                {emailError ? (
                  <p
                    id="reset-email-error"
                    className="mt-1.5 text-xs text-[var(--quant-destructive)]"
                  >
                    {emailError}
                  </p>
                ) : (
                  <p
                    id="reset-email-hint"
                    className="mt-1.5 text-xs text-[var(--quant-muted-foreground)]"
                  >
                    Use the full address associated with your account.
                  </p>
                )}
              </div>

              {requestError ? (
                <div
                  role="alert"
                  className="rounded-xl border border-[var(--quant-destructive)]/30 bg-[var(--quant-destructive)]/10 px-4 py-3 text-sm text-[var(--quant-destructive)]"
                >
                  {requestError}
                </div>
              ) : null}

              <p className="sr-only" role="status" aria-live="polite">
                {isSubmitting ? 'Requesting password reset instructions.' : ''}
              </p>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-[var(--brand-primary)] px-4 py-3 text-sm font-semibold text-[#111111] shadow-[0_10px_30px_rgba(255,140,66,0.2)] transition-[background-color,transform,box-shadow] hover:bg-[var(--brand-primary-hover)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transform-none motion-reduce:transition-none"
              >
                {isSubmitting ? 'Submitting request…' : 'Request reset instructions'}
              </button>
            </form>
          )}

          {!isComplete ? (
            <p className="mt-7 text-center text-sm text-[var(--quant-muted-foreground)]">
              Remember your password?{' '}
              <Link
                href="/login"
                /* Padding for a 44px hit area, negative margin so the line keeps its height. */
                className="-my-3.5 inline-flex items-center px-1.5 py-3.5 font-semibold text-[var(--brand-primary)] underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
              >
                Sign in
              </Link>
            </p>
          ) : null}
        </div>
      </AuthShell>
    </PageTransition>
  );
}
