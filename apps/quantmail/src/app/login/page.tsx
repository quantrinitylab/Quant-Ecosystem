'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../providers/auth-provider';
import { PageTransition } from '../../components/PageTransition';
import { AuthBrandPanel } from '../../components/auth/AuthBrandPanel';
import { AuthShell } from '../../components/auth/AuthShell';
import { QUANT_MAIL_DOMAIN, toQuantAddress } from '../../config/identity';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isLoading } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const successMessage = searchParams?.get('success');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!identifier || !password) {
      setError('Enter your address and password');
      return;
    }
    // Accept either a full address or a bare handle (auto-complete the domain).
    const email = identifier.includes('@') ? identifier.trim() : toQuantAddress(identifier);
    try {
      await login(email, password);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    }
  }

  return (
    <PageTransition>
      <AuthShell
        brand={
          <AuthBrandPanel
            eyebrow="Welcome back"
            title="Sign in to your Quant identity."
            subtitle="One secure account for mail, code, calendar and AI across the entire ecosystem."
          />
        }
      >
        <div className="w-full max-w-sm mx-auto animate-slide-up">
          <div className="mb-8">
            <h1 className="text-[26px] font-semibold tracking-tight text-[var(--quant-foreground)]">
              Sign in to QuantMail
            </h1>
            <p className="text-sm text-[var(--quant-muted-foreground)] mt-1.5">
              Use your QuantMail address or handle.
            </p>
          </div>

          {successMessage && (
            <div className="mb-5 rounded-xl border border-[var(--quant-success)]/30 bg-[var(--quant-success)]/10 px-3.5 py-2.5 text-sm text-[var(--quant-success)]">
              {successMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="login-id"
                className="block text-[13px] font-medium text-[var(--quant-foreground)] mb-1.5"
              >
                Address or handle
              </label>
              <input
                id="login-id"
                type="text"
                autoComplete="username"
                placeholder={`you@${QUANT_MAIL_DOMAIN}`}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] px-3.5 py-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-[var(--brand-primary)]/60 placeholder:text-[var(--quant-muted-foreground)]"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="login-password"
                  className="block text-[13px] font-medium text-[var(--quant-foreground)]"
                >
                  Password
                </label>
                <Link
                  href="/security"
                  className="text-xs text-[var(--brand-primary)] hover:underline underline-offset-4"
                >
                  Forgot?
                </Link>
              </div>
              <div className="flex items-stretch rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] overflow-hidden transition-shadow focus-within:ring-2 focus-within:ring-[var(--brand-primary)]/60">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
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
              disabled={isLoading}
              className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-[var(--brand-primary)] to-[var(--quant-secondary)] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--brand-primary)]/25 transition-all hover:shadow-xl hover:shadow-[var(--brand-primary)]/30 active:scale-[0.99] disabled:opacity-70"
            >
              {isLoading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[var(--quant-muted-foreground)]">
            New to QuantMail?{' '}
            <Link
              href="/register"
              className="font-medium text-[var(--brand-primary)] hover:underline underline-offset-4"
            >
              Create your address
            </Link>
          </p>
        </div>
      </AuthShell>
    </PageTransition>
  );
}
