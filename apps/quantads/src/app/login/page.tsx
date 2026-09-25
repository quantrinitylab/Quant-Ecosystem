'use client';

// ============================================================================
// QuantAds — sign in.
// The canonical route: every other app in the ecosystem signs in at /login, and
// /auth/login now permanently redirects here. Credentials are exchanged at
// /api/auth/login (a proxy to QuantMail, the identity root) and the resulting
// token is verified server-side before anyone is considered signed in.
// ============================================================================
import { Suspense, useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card } from '@quant/shared-ui';
import { useAuth } from '../../providers/auth-provider';
import { DEFAULT_RETURN_PATH, safeReturnPath } from '../../lib/return-path';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [twoFactorNotice, setTwoFactorNotice] = useState(false);

  // Only a same-origin absolute path is honoured, so ?returnTo cannot be used
  // to bounce a freshly signed-in visitor off to another site.
  const destination = useCallback(
    () => safeReturnPath(searchParams?.get('returnTo')) ?? DEFAULT_RETURN_PATH,
    [searchParams],
  );

  const onSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setTwoFactorNotice(false);

      if (!email.trim() || !password) {
        setError('Enter your email and password.');
        return;
      }

      try {
        const outcome = await login(email.trim(), password);
        if (outcome.status === 'two-factor-required') {
          setPassword('');
          setTwoFactorNotice(true);
          return;
        }
        router.push(destination());
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Sign-in failed. Try again.');
      }
    },
    [login, email, password, router, destination],
  );

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[var(--quant-background)] px-4">
      <div className="w-full max-w-sm">
        <Card className="p-6">
          <h1 className="mb-1 text-xl font-bold">Sign in to QuantAds</h1>
          <p className="mb-5 text-sm text-[var(--quant-muted-foreground)]">
            Use your QuantID — one account for the whole ecosystem.
          </p>

          {twoFactorNotice ? (
            <div
              role="status"
              className="mb-5 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] px-4 py-3 text-sm text-[var(--quant-foreground)]"
            >
              This account uses two-factor authentication. Finish signing in on QuantMail, then
              reopen QuantAds — your session carries over.
            </div>
          ) : null}

          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="login-email" className="mb-1 block text-xs font-medium">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="you@quantmail.in"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-[var(--quant-border)] bg-[var(--quant-background)] px-3 py-2 text-sm focus:border-[var(--quant-foreground)] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="mb-1 block text-xs font-medium">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-[var(--quant-border)] bg-[var(--quant-background)] px-3 py-2 text-sm focus:border-[var(--quant-foreground)] focus:outline-none"
              />
            </div>

            {error ? (
              <p role="alert" className="text-sm text-red-500">
                {error}
              </p>
            ) : null}

            <Button type="submit" variant="primary" className="w-full" disabled={isLoading}>
              {isLoading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-[var(--quant-muted-foreground)]">
            New to the ecosystem?{' '}
            <a
              href="https://quantmail.in/register"
              className="font-semibold underline underline-offset-4"
            >
              Create a QuantID
            </a>
          </p>
        </Card>
      </div>
    </div>
  );
}

// useSearchParams() must sit under a Suspense boundary or `next build` fails
// static generation for this route.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
