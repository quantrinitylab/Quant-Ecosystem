// ============================================================================
// QuantCooks — sign in.
// One QuantID (the ecosystem account) signs you in across QuantCooks. Password is
// checked by the identity service via the /auth proxy; a second factor, if the
// account has one, is completed on QuantMail and then this session is restored.
// ============================================================================
import { useCallback, useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../providers/auth-provider';
import { BrandMark } from '../components/BrandMark';

/** Only allow same-origin, absolute-path returns so ?returnTo can't open-redirect. */
function safeReturnPath(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading, isAuthenticated, ssoError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [twoFactorNotice, setTwoFactorNotice] = useState(false);

  const destination = useCallback(
    () => safeReturnPath(router.query.returnTo) ?? '/',
    [router.query.returnTo],
  );

  // Auto-redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      void router.replace(destination());
    }
  }, [isAuthenticated, isLoading, router, destination]);


  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
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
      void router.push(destination());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in failed. Try again.');
    }
  }

  // Design upgrade Phase A (D-2): the markup below is a pure restyle —
  // the dark auth canvas + panel, the Spring Q lockup, one accent action
  // hierarchy (SSO primary, password submit secondary). Every handler,
  // id, label, role and copy string is the one this page always had;
  // the only content change is the lightning-bolt glyph that prefixed
  // the SSO label, replaced by the brand mark (a glyph swap, listed in
  // the build report).
  return (
    <div className="auth-canvas">
      <div className="auth-panel">
        <div className="auth-lockup">
          <BrandMark size={44} variant="accent" />
          <span className="auth-wordmark">QuantCooks</span>
        </div>
        <h1 className="auth-title">Sign in to QuantCooks</h1>
        <p className="auth-sub">Use your QuantID — one account for the whole ecosystem.</p>

        <a
          href={`https://quantmail.in/sso?returnTo=${encodeURIComponent(typeof window !== 'undefined' ? `${window.location.origin}${destination()}` : 'https://quantcooks.quantrinity.in/')}`}
          className="auth-sso"
        >
          <BrandMark size={18} variant="mono" />
          Continue with Quant Account
        </a>

        <div className="auth-divider">
          <span>OR WITH QUANT ID / EMAIL</span>
        </div>

        {ssoError ? (
          <div role="alert" className="auth-alert">
            {ssoError}
          </div>
        ) : null}

        {twoFactorNotice ? (
          <div role="status" className="auth-note">
            This account uses two-factor authentication. Finish signing in on QuantMail, then reopen
            QuantCooks — your session carries over.
          </div>
        ) : null}

        <form onSubmit={handleSubmit} noValidate className="auth-form">
          <div className="auth-field">
            <label htmlFor="login-email" className="auth-label">
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
              className="auth-input"
            />
          </div>

          <div className="auth-field">
            <label htmlFor="login-password" className="auth-label">
              Password
            </label>
            <div className="auth-password">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="auth-password-input"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="auth-toggle"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {error ? (
            <div role="alert" className="auth-alert">
              {error}
            </div>
          ) : null}

          <button type="submit" disabled={isLoading} className="auth-submit">
            {isLoading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="auth-footer">
          New to the ecosystem?{' '}
          <a href="https://quantmail.in/register">Create a QuantID</a>
        </p>
      </div>
    </div>
  );
}
