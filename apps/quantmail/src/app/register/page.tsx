'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '../../services/api-client';
import { PageTransition } from '../../components/PageTransition';
import { AuthBrandPanel } from '../../components/auth/AuthBrandPanel';
import { AuthShell } from '../../components/auth/AuthShell';
import {
  QUANT_MAIL_DOMAIN,
  normalizeUsername,
  isValidUsername,
  toQuantAddress,
} from '../../config/identity';

export default function RegisterPage() {
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalized = useMemo(() => normalizeUsername(username), [username]);
  const address = normalized ? toQuantAddress(normalized) : '';

  // Lightweight password-strength signal (length + variety), 0..4.
  const strength = useMemo(() => {
    let s = 0;
    if (password.length >= 8) s++;
    if (password.length >= 12) s++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s++;
    if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) s++;
    return s;
  }, [password]);

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!normalized) errors.username = 'Choose a username';
    else if (!isValidUsername(normalized))
      errors.username = '3–30 chars: letters, numbers, dot, dash, underscore';
    if (!password) errors.password = 'Password is required';
    else if (password.length < 8) errors.password = 'At least 8 characters';
    if (confirmPassword !== password) errors.confirmPassword = 'Passwords do not match';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const res = await apiClient.register({
        email: address,
        password,
        username: normalized,
        displayName: normalized,
        acceptTerms: true,
      });
      if (res.success) {
        router.push(
          `/login?success=${encodeURIComponent(`Welcome to QuantMail. Sign in as ${address}`)}`,
        );
      } else {
        setError(res.error?.message || 'Registration failed. Please try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const strengthLabel = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'][strength];
  const strengthColor = ['#ef4444', '#f59e0b', '#f59e0b', '#3b82f6', '#22c55e'][strength];

  return (
    <PageTransition>
      <AuthShell
        brand={
          <AuthBrandPanel
            eyebrow="One identity for everything"
            title="Your whole workflow, one address."
            subtitle="Mail, code, calendar and AI — unified under a single QuantMail identity. Claim your handle."
          />
        }
      >
        <div className="w-full max-w-sm mx-auto animate-slide-up">
          <div className="mb-8">
            <h1 className="text-[26px] font-semibold tracking-tight text-[var(--quant-foreground)]">
              Create your QuantMail
            </h1>
            <p className="text-sm text-[var(--quant-muted-foreground)] mt-1.5">
              Pick a handle — it becomes your address across the ecosystem.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Username → live address */}
            <div>
              <label
                htmlFor="reg-username"
                className="block text-[13px] font-medium text-[var(--quant-foreground)] mb-1.5"
              >
                Choose your handle
              </label>
              <div
                className={`flex items-stretch rounded-xl border bg-[var(--quant-surface)] overflow-hidden transition-shadow focus-within:ring-2 focus-within:ring-[var(--brand-primary)]/60 ${
                  fieldErrors.username
                    ? 'border-[var(--quant-destructive)]'
                    : 'border-[var(--quant-border)]'
                }`}
              >
                <input
                  id="reg-username"
                  type="text"
                  inputMode="text"
                  autoComplete="username"
                  placeholder="shivani454"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="flex-1 min-w-0 bg-transparent px-3.5 py-3 text-sm outline-none placeholder:text-[var(--quant-muted-foreground)]"
                />
                <span className="flex items-center px-3 text-sm text-[var(--quant-muted-foreground)] bg-[var(--quant-muted)] border-l border-[var(--quant-border)] select-none">
                  @{QUANT_MAIL_DOMAIN}
                </span>
              </div>
              {fieldErrors.username ? (
                <p className="text-xs text-[var(--quant-destructive)] mt-1.5">
                  {fieldErrors.username}
                </p>
              ) : (
                <p className="text-xs text-[var(--quant-muted-foreground)] mt-1.5">
                  {address ? (
                    <>
                      Your address:{' '}
                      <span className="font-medium text-[var(--brand-primary)]">{address}</span>
                    </>
                  ) : (
                    'Letters, numbers, dot, dash, underscore.'
                  )}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="reg-password"
                className="block text-[13px] font-medium text-[var(--quant-foreground)] mb-1.5"
              >
                Password
              </label>
              <div
                className={`flex items-stretch rounded-xl border bg-[var(--quant-surface)] overflow-hidden transition-shadow focus-within:ring-2 focus-within:ring-[var(--brand-primary)]/60 ${
                  fieldErrors.password
                    ? 'border-[var(--quant-destructive)]'
                    : 'border-[var(--quant-border)]'
                }`}
              >
                <input
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Create a strong password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="flex-1 min-w-0 bg-transparent px-3.5 py-3 text-sm outline-none placeholder:text-[var(--quant-muted-foreground)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="px-3 text-xs font-medium text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {password && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-[var(--quant-muted)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${(strength / 4) * 100}%`, background: strengthColor }}
                    />
                  </div>
                  <span className="text-[11px]" style={{ color: strengthColor }}>
                    {strengthLabel}
                  </span>
                </div>
              )}
              {fieldErrors.password && (
                <p className="text-xs text-[var(--quant-destructive)] mt-1.5">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {/* Confirm */}
            <div>
              <label
                htmlFor="reg-confirm"
                className="block text-[13px] font-medium text-[var(--quant-foreground)] mb-1.5"
              >
                Confirm password
              </label>
              <input
                id="reg-confirm"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`w-full rounded-xl border bg-[var(--quant-surface)] px-3.5 py-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-[var(--brand-primary)]/60 placeholder:text-[var(--quant-muted-foreground)] ${
                  fieldErrors.confirmPassword
                    ? 'border-[var(--quant-destructive)]'
                    : 'border-[var(--quant-border)]'
                }`}
              />
              {fieldErrors.confirmPassword && (
                <p className="text-xs text-[var(--quant-destructive)] mt-1.5">
                  {fieldErrors.confirmPassword}
                </p>
              )}
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-[var(--quant-destructive)]/30 bg-[var(--quant-destructive)]/10 px-3.5 py-2.5 text-sm text-[var(--quant-destructive)]"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-[var(--brand-primary)] to-[var(--quant-secondary)] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--brand-primary)]/25 transition-all hover:shadow-xl hover:shadow-[var(--brand-primary)]/30 active:scale-[0.99] disabled:opacity-70"
            >
              {isSubmitting ? 'Creating your account…' : 'Claim your address'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[var(--quant-muted-foreground)]">
            Already have an account?{' '}
            <Link
              href="/login"
              className="font-medium text-[var(--brand-primary)] hover:underline underline-offset-4"
            >
              Sign in
            </Link>
          </p>
        </div>
      </AuthShell>
    </PageTransition>
  );
}
