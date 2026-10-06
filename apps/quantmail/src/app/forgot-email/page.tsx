'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AuthBrandPanel } from '../../components/auth/AuthBrandPanel';
import { AuthShell } from '../../components/auth/AuthShell';
import { PageTransition } from '@quant/shared-ui';
import { apiClient } from '../../services/api-client';

export default function ForgotEmailPage() {
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPhoneError(null);
    setRequestError(null);

    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7) {
      setPhoneError('Enter the mobile number linked to your account.');
      return;
    }

    setIsSubmitting(true);
    const response = await apiClient.requestEmailLookup(digits);
    setIsSubmitting(false);

    if (!response.success && response.error?.code === 'NETWORK_ERROR') {
      setRequestError('We could not reach QuantMail. Check your connection and try again.');
      return;
    }

    // Neutral confirmation either way — we never reveal whether a number is registered.
    setIsComplete(true);
  }

  return (
    <PageTransition>
      <AuthShell
        brand={
          <AuthBrandPanel
            eyebrow="Account recovery"
            title="Find your address."
            subtitle="Enter the mobile number linked to your QuantMail account and we'll point you back to it."
          />
        }
      >
        <div>
          <div className="mb-8">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-primary)]">
              Account recovery
            </p>
            <h1 className="text-[28px] font-semibold tracking-[-0.035em] text-[var(--quant-foreground)] sm:text-[30px]">
              Find your email address
            </h1>
            <p className="mt-2 text-sm leading-6 text-[var(--quant-muted-foreground)]">
              Enter the mobile number you used when creating your address.
            </p>
          </div>

          {isComplete ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded-2xl border border-[var(--quant-success)]/30 bg-[var(--quant-success)]/10 p-5"
            >
              <h2 className="text-sm font-semibold text-[var(--quant-foreground)]">
                Check your phone
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--quant-muted-foreground)]">
                If a QuantMail address is linked to that number, recovery details are on
                their way. We do not confirm whether a number is registered.
              </p>
              <Link
                href="/login"
                className="mt-5 inline-flex min-h-[44px] items-center text-sm font-semibold text-[var(--brand-primary)] underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
              >
                Return to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <div>
                <label htmlFor="recover-phone" className="mb-2 block text-[13px] font-medium">
                  Mobile number
                </label>
                <input
                  id="recover-phone"
                  type="tel"
                  required
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  aria-invalid={Boolean(phoneError)}
                  aria-describedby={phoneError ? 'recover-phone-error' : undefined}
                  className={`w-full rounded-xl border bg-[var(--quant-surface)] px-3.5 py-3 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-[var(--quant-muted-foreground)] focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/20 motion-reduce:transition-none ${phoneError ? 'border-[var(--quant-destructive)]' : 'border-[var(--quant-border)]'}`}
                />
                {phoneError ? (
                  <p
                    id="recover-phone-error"
                    className="mt-1.5 text-xs text-[var(--quant-destructive)]"
                  >
                    {phoneError}
                  </p>
                ) : null}
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
                {isSubmitting ? 'Looking up your address.' : ''}
              </p>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-[var(--brand-primary)] px-4 py-3 text-sm font-semibold text-[#111111] shadow-[0_10px_30px_rgba(255,140,66,0.2)] transition-[background-color,transform,box-shadow] hover:bg-[var(--brand-primary-hover)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transform-none motion-reduce:transition-none"
              >
                {isSubmitting ? 'Looking up…' : 'Find my address'}
              </button>

              <p className="text-center text-sm text-[var(--quant-muted-foreground)]">
                Remember your password?{' '}
                <Link
                  href="/login"
                  className="font-semibold text-[var(--brand-primary)] underline-offset-4 hover:underline"
                >
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </AuthShell>
    </PageTransition>
  );
}
