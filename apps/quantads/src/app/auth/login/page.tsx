'use client';

import { Suspense, useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, Button, LoadingState } from '@quant/shared-ui';
import { useAuth } from '@quant/shared-ui';

/** Only allow same-origin, absolute-path returns so ?returnTo can't open-redirect. */
function safeReturnPath(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

const SSO_BASE = 'https://quantmail.in/sso';

/**
 * QuantAds sign-in — real, backend-verified identity via QuantMail OAuth2.
 * Credentials are exchanged at /api/auth/login (proxied to QuantMail), then
 * useAuth resolves the verified user from /api/auth/userinfo. Fail-closed: a
 * failed exchange surfaces an honest error and never creates a fake session.
 *
 * Follows the QuantGram/QuantTube pattern: a prominent "Continue with Quant
 * Account" button deep-links to QuantMail SSO with a same-origin returnTo,
 * and any SSO handoff token in the URL (?token= / ?__quant_sso_ticket=) is
 * captured on arrival.
 */
function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isLoading, error, isAuthenticated, refreshToken } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const returnTo = safeReturnPath(searchParams ? searchParams.get('returnTo') : null) ?? '/economy/creator';

  // Capture an SSO handoff token QuantMail may have appended to our returnTo.
  // (The UniversalSSOTokenBridge ticket is consumed by useAuth itself.)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') || params.get('accessToken');
    if (token && !isAuthenticated) {
      try {
        window.localStorage.setItem('quant_access_token', token);
      } catch {
        // Sandboxed iframe — the refresh below will simply fail closed.
      }
      const url = new URL(window.location.href);
      url.searchParams.delete('token');
      url.searchParams.delete('accessToken');
      window.history.replaceState({}, document.title, url.pathname + url.search);
      void refreshToken().then(() => router.replace(returnTo));
      return;
    }
    if (isAuthenticated) {
      router.replace(returnTo);
    }
  }, [isAuthenticated, refreshToken, router, returnTo]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitting(true);
      try {
        await login(email, password);
        router.push(returnTo);
      } catch {
        // error is surfaced via useAuth().error — stay on the page.
      } finally {
        setSubmitting(false);
      }
    },
    [login, email, password, router, returnTo],
  );

  // Same pattern as QuantGram/QuantTube: SSO hands back to this login page,
  // which captures the token above and forwards to the original destination.
  const ssoHref =
    typeof window !== 'undefined'
      ? `${SSO_BASE}?returnTo=${encodeURIComponent(
          `${window.location.origin}/auth/login?returnTo=${encodeURIComponent(returnTo)}`,
        )}`
      : `${SSO_BASE}?returnTo=${encodeURIComponent(`https://quantads.quantrinity.in/auth/login`)}`;

  if (isAuthenticated) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4 py-8">
        <div className="w-full max-w-md text-center">
          <p className="text-[var(--quant-foreground)]">You are signed in.</p>
          <Button variant="primary" className="mt-4" onClick={() => router.push(returnTo)}>
            Continue to QuantAds
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <Card className="p-6">
        <h1 className="text-xl font-bold mb-1">Sign in to QuantAds</h1>
        <p className="text-sm text-[var(--quant-muted-foreground)] mb-5">
          Use your QuantID — one account for the whole ecosystem.
        </p>

        <div className="mb-6">
          <a
            href={ssoHref}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            ⚡ Continue with Quant Account
          </a>
        </div>

        <div className="mb-6 flex items-center justify-center gap-4">
          <div className="h-px flex-1 bg-[var(--quant-border)]"></div>
          <span className="text-[11px] font-semibold tracking-wider text-[var(--quant-muted-foreground)]">
            OR WITH QUANT ID / EMAIL
          </span>
          <div className="h-px flex-1 bg-[var(--quant-border)]"></div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-xs font-medium mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--quant-background)] border border-[var(--quant-border)] text-sm min-h-[44px] focus:outline-none focus:border-[var(--quant-foreground)]"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs font-medium mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--quant-background)] border border-[var(--quant-border)] text-sm min-h-[44px] focus:outline-none focus:border-[var(--quant-foreground)]"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            disabled={submitting || isLoading}
          >
            {submitting || isLoading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--quant-muted-foreground)]">
          New to the ecosystem?{' '}
          <a
            href="https://quantmail.in/register"
            className="font-semibold text-[var(--brand-primary)] underline-offset-4 hover:underline"
          >
            Create a QuantID
          </a>
        </p>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingState text="Loading sign in…" />}>
      <LoginPageInner />
    </Suspense>
  );
}
