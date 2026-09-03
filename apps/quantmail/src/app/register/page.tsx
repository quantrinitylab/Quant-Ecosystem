'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthBrandPanel } from '../../components/auth/AuthBrandPanel';
import { AuthShell } from '../../components/auth/AuthShell';
import { PasswordStrengthMeter } from '../../components/auth/PasswordStrengthMeter';
import { PageTransition } from '@quant/shared-ui';
import {
  QUANT_MAIL_DOMAIN,
  isValidUsername,
  normalizeUsername,
  toQuantAddress,
} from '../../config/identity';
import { browserAuthSession } from '../../services/browser-auth-session';

interface RegistrationErrors {
  username?: string;
  password?: string;
  confirmPassword?: string;
  terms?: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<RegistrationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalized = useMemo(() => normalizeUsername(username), [username]);
  const address = normalized ? toQuantAddress(normalized) : '';

  function validate(): boolean {
    const errors: RegistrationErrors = {};
    if (!normalized) errors.username = 'Choose a handle.';
    else if (!isValidUsername(normalized)) {
      errors.username = 'Use 3–30 letters, numbers, dots, dashes, or underscores.';
    }
    if (!password) errors.password = 'Enter a password.';
    else if (password.length < 8) errors.password = 'Use at least 8 characters.';
    if (!confirmPassword) errors.confirmPassword = 'Confirm your password.';
    else if (confirmPassword !== password) errors.confirmPassword = 'Passwords do not match.';
    if (!termsAccepted) errors.terms = 'Acknowledge the required terms to continue.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const response = await browserAuthSession.register({
        email: address,
        password,
        username: normalized,
        displayName: normalized,
        acceptTerms: termsAccepted,
      });
      if (response.success) {
        router.push(
          `/login?success=${encodeURIComponent(`Welcome to QuantMail. Sign in as ${address}`)}`,
        );
      } else {
        setError(response.error?.message || 'Registration failed. Try again.');
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Registration failed. Try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PageTransition>
      <AuthShell
        brand={
          <AuthBrandPanel
            eyebrow="Create your workspace identity"
            title="Start with one clear address."
            subtitle="Claim a QuantMail handle for a focused workspace across mail, scheduling, and assisted drafting."
          />
        }
      >
        <div>
          <div className="mb-7">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--brand-primary)]">
              New account
            </p>
            <h1 className="text-[28px] font-semibold tracking-[-0.035em] text-[var(--quant-foreground)] sm:text-[30px]">
              Create your QuantMail
            </h1>
            <p className="mt-2 text-sm leading-6 text-[var(--quant-muted-foreground)]">
              Pick the handle for your QuantMail address.
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="reg-username" className="mb-2 block text-[13px] font-medium">
                Account handle
              </label>
              <div
                className={`flex overflow-hidden rounded-xl border bg-[var(--quant-surface)] transition-[border-color,box-shadow] focus-within:border-[var(--brand-primary)] focus-within:ring-2 focus-within:ring-[var(--brand-primary)]/20 motion-reduce:transition-none ${fieldErrors.username ? 'border-[var(--quant-destructive)]' : 'border-[var(--quant-border)]'}`}
              >
                <input
                  id="reg-username"
                  type="text"
                  required
                  inputMode="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="yourname"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.username)}
                  aria-describedby="reg-username-help"
                  className="min-w-0 flex-1 bg-transparent px-3.5 py-3 text-sm outline-none placeholder:text-[var(--quant-muted-foreground)]"
                />
                <span
                  className="flex items-center border-l border-[var(--quant-border)] bg-[var(--quant-muted)] px-3 text-xs text-[var(--quant-muted-foreground)]"
                  aria-hidden="true"
                >
                  @{QUANT_MAIL_DOMAIN}
                </span>
              </div>
              <p
                id="reg-username-help"
                className={`mt-1.5 text-xs ${fieldErrors.username ? 'text-[var(--quant-destructive)]' : 'text-[var(--quant-muted-foreground)]'}`}
              >
                {fieldErrors.username ||
                  (address ? `Your address will be ${address}` : '3–30 supported characters.')}
              </p>
            </div>

            <div>
              <label htmlFor="reg-password" className="mb-2 block text-[13px] font-medium">
                Password
              </label>
              <div
                className={`flex overflow-hidden rounded-xl border bg-[var(--quant-surface)] transition-[border-color,box-shadow] focus-within:border-[var(--brand-primary)] focus-within:ring-2 focus-within:ring-[var(--brand-primary)]/20 motion-reduce:transition-none ${fieldErrors.password ? 'border-[var(--quant-destructive)]' : 'border-[var(--quant-border)]'}`}
              >
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby="reg-password-help"
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
                id="reg-password-help"
                error={fieldErrors.password}
                hint="Use 8 or more characters."
              />
            </div>

            <div>
              <label htmlFor="reg-confirm" className="mb-2 block text-[13px] font-medium">
                Confirm password
              </label>
              <input
                id="reg-confirm"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                aria-invalid={Boolean(fieldErrors.confirmPassword)}
                aria-describedby={fieldErrors.confirmPassword ? 'reg-confirm-error' : undefined}
                className={`w-full rounded-xl border bg-[var(--quant-surface)] px-3.5 py-3 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-[var(--quant-muted-foreground)] focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/20 motion-reduce:transition-none ${fieldErrors.confirmPassword ? 'border-[var(--quant-destructive)]' : 'border-[var(--quant-border)]'}`}
              />
              {fieldErrors.confirmPassword ? (
                <p
                  id="reg-confirm-error"
                  className="mt-1.5 text-xs text-[var(--quant-destructive)]"
                >
                  {fieldErrors.confirmPassword}
                </p>
              ) : confirmPassword && password ? (
                <p
                  className={`mt-1.5 text-xs flex items-center gap-1.5 ${confirmPassword === password ? 'text-emerald-400' : 'text-[var(--quant-destructive)]'}`}
                >
                  {confirmPassword === password ? (
                    <>
                      <svg
                        className="size-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Passwords match</span>
                    </>
                  ) : (
                    <>
                      <svg
                        className="size-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                      <span>Passwords do not match</span>
                    </>
                  )}
                </p>
              ) : null}
            </div>

            <div>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)]/50 p-3.5">
                <input
                  type="checkbox"
                  required
                  checked={termsAccepted}
                  onChange={(event) => setTermsAccepted(event.target.checked)}
                  aria-invalid={Boolean(fieldErrors.terms)}
                  aria-describedby={fieldErrors.terms ? 'reg-terms-error' : undefined}
                  className="mt-0.5 h-4 w-4 rounded border-[var(--quant-border)] accent-[var(--brand-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#121215]"
                />
                <span className="text-xs leading-5 text-[var(--quant-muted-foreground)]">
                  I acknowledge the terms required to create an account.
                </span>
              </label>
              {fieldErrors.terms ? (
                <p id="reg-terms-error" className="mt-1.5 text-xs text-[var(--quant-destructive)]">
                  {fieldErrors.terms}
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
              {isSubmitting ? 'Creating your account.' : ''}
            </p>
            <button
              type="submit"
              disabled={isSubmitting}
              className="auth-primary-action w-full rounded-xl border px-4 py-3 text-sm font-semibold transition-[background-color,transform,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0b0d] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transform-none motion-reduce:transition-none"
            >
              {isSubmitting ? 'Creating account…' : 'Create QuantMail account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[var(--quant-muted-foreground)]">
            Already have an account?{' '}
            <Link
              href="/login"
              /* Padding for a 44px hit area, negative margin so the line keeps its height. */
              className="-my-3.5 inline-flex items-center px-1.5 py-3.5 font-semibold text-[var(--brand-primary)] underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
            >
              Sign in
            </Link>
          </p>
        </div>
      </AuthShell>
    </PageTransition>
  );
}
