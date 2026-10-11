'use client';

// ============================================================================
// QuantAI — Sign-in page.
// Identity spec: QuantMail is the identity root. First-visit users with a
// QuantMail account get the hero "Continue with QuantMail" SSO path (no new
// password; account stays safe); email/password stays secondary below it.
// "Forgot password?" routes to QuantMail's reset page; account creation goes
// through QuantMail's register. Honest UI: no invented performance claims, no
// fake security badges — every statement on this screen is verifiably true.
// Brand lockup uses the official @quant/brand QuantAI logo (single source of
// truth, same asset family as QuantMail / QuantChat).
// ============================================================================
import React, { Suspense, useCallback, useEffect, useId, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { UniversalSSOTokenBridge } from '@quant/shared-ui';
import { appLogos } from '@quant/brand';
import { useAuth } from '../../providers/auth-provider';
import { ingestSSOToken } from '../../services/auth-session';
import { NeuralFieldCanvas } from '../../components/auth/NeuralFieldCanvas';
import { scrubSsoHandoffParams } from '../../lib/sso-url-params';

/** Only allow same-origin, absolute-path returns so ?returnTo cannot open-redirect. */
function safeReturnPath(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

/** Official QuantAI brand lockup (logo + wordmark) from @quant/brand. */
function QuantAILockup() {
  return (
    <div
      className="mx-auto mb-6 flex justify-center"
      role="img"
      aria-label="QuantAI"
      // Trusted static string from our own @quant/brand package (no user input).
      dangerouslySetInnerHTML={{ __html: appLogos.quantai.dark }}
      style={{ maxWidth: 168 }}
    />
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isLoading, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [twoFactorNotice, setTwoFactorNotice] = useState(false);
  const errorId = useId();

  const destination = useCallback(
    () => safeReturnPath(searchParams?.get('returnTo') ?? null) ?? '/',
    [searchParams],
  );

  // Auto-redirect if already authenticated or session restored via SSO / refresh
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      router.replace(destination());
    }
  }, [isAuthenticated, isLoading, router, destination]);

  // Auto-capture SSO tokens returned from QuantMail Account Chooser or Cross-App Jump Bridge
  useEffect(() => {
    if (typeof window === 'undefined') return;
    (async () => {
      try {
        const bridge = UniversalSSOTokenBridge.getInstance();
        // Fail-closed: consumeHandoffTicket re-verifies the ticket's token
        // server-side and returns null for forged/tampered/expired tickets.
        const consumed = await bridge.consumeHandoffTicket();
        const params = new URLSearchParams(window.location.search);
        const rawReturn =
          consumed?.returnPath || params.get('returnTo') || params.get('__quant_return');

        const resolvedToken = consumed?.session?.token;

        if (resolvedToken) {
          // Store the server-verified identity too — without it the UI falls
          // back to fabricated placeholders.
          const s = consumed?.session;
          ingestSSOToken(
            resolvedToken,
            s && s.userId && s.email
              ? { id: s.userId, email: s.email, name: s.displayName || undefined }
              : null,
          );
          try {
            const url = scrubSsoHandoffParams(new URL(window.location.href));
            const cleanUrl = url.pathname + (url.search ? url.search : '') + url.hash;
            window.history.replaceState({}, document.title, cleanUrl);
          } catch {
            window.history.replaceState({}, document.title, window.location.pathname);
          }

          let targetDestination = destination();
          if (rawReturn) {
            const decoded = decodeURIComponent(rawReturn);
            const validation = UniversalSSOTokenBridge.validateSafeReturnPath(decoded);
            if (validation.isSafe && validation.sanitizedUrl !== '/login') {
              targetDestination = validation.sanitizedUrl;
            }
          }
          router.replace(targetDestination);
        }
      } catch {
        // Sandboxed environment
      }
    })();
  }, [router, destination]);

  // "Continue with QuantMail" always performs a real SSO handshake with QuantMail.
  // We deliberately do NOT short-circuit on a locally stored token: reusing a stale/expired
  // local token makes the button appear dead and prevents account switching.
  const handleQuantSSO = useCallback(() => {
    const target = destination();
    const returnParam = target && target !== '/' ? `?returnTo=${encodeURIComponent(target)}` : '';
    const returnTo = encodeURIComponent(`${window.location.origin}/login${returnParam}`);
    window.location.href = `https://quantmail.in/sso?returnTo=${returnTo}&client_id=quantai`;
  }, [destination]);

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
      router.push(destination());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in failed. Try again.');
    }
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-zinc-950 px-4 py-10 text-white selection:bg-violet-500/30 sm:py-12">
      {/* Ambient brand backdrop — decorative only, non-interactive, honors reduced motion */}
      <NeuralFieldCanvas className="opacity-40" particleCount={36} interactive={false} />

      {/* Soft brand aura */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[720px] max-w-none -translate-x-1/2 rounded-full bg-violet-600/10 blur-3xl"
      />

      {/* Sign-in card */}
      <main className="relative z-10 w-full max-w-[400px] rounded-2xl border border-white/10 bg-zinc-900/70 p-6 shadow-2xl shadow-black/60 backdrop-blur-xl sm:p-8">
        <div className="mb-6 text-center">
          <QuantAILockup />
          <h1 className="text-xl font-semibold tracking-tight text-white">Sign in</h1>
          <p className="mt-1.5 text-sm text-zinc-400">Sign in to chat with AI</p>
        </div>

        {/* 2FA notice */}
        {twoFactorNotice ? (
          <div
            role="status"
            className="mb-5 flex items-start gap-3 rounded-xl border border-violet-500/30 bg-violet-500/10 p-3.5 text-[13px] leading-relaxed text-violet-200"
          >
            <svg
              className="mt-0.5 h-4 w-4 shrink-0 text-violet-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>
              Two-factor authentication is turned on for this account. Finish signing in with your
              Quant account to continue.
            </span>
          </div>
        ) : null}

        {/* Primary SSO */}
        <button
          type="button"
          onClick={handleQuantSSO}
          className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.06] px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 active:scale-[0.99]"
        >
          <svg
            className="h-4 w-4 text-violet-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor" fillOpacity="0.25" />
          </svg>
          <span>Continue with QuantMail</span>
        </button>
        <p className="mt-2.5 text-center text-xs text-zinc-500">
          One account for the ecosystem — no new password needed
        </p>
        <p className="mt-1.5 text-center text-xs leading-relaxed text-zinc-500">
          Already have a QuantMail account? Continue with QuantMail — your account stays safe, no
          new password.
        </p>

        {/* Divider */}
        <div className="relative my-6 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-white/10" />
          <span className="absolute left-1/2 -translate-x-1/2 bg-zinc-900 px-3 text-[11px] font-medium uppercase tracking-widest text-zinc-500">
            or
          </span>
        </div>

        {/* Email / password form */}
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="login-email" className="mb-1.5 block text-[13px] font-medium text-zinc-300">
              Email address
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              required
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@quantmail.in"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-describedby={error ? errorId : undefined}
              aria-invalid={error ? true : undefined}
              className="w-full rounded-xl border border-white/10 bg-zinc-950/70 px-3.5 py-3 text-base text-white placeholder-zinc-500 outline-none transition focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 sm:text-sm"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="login-password" className="block text-[13px] font-medium text-zinc-300">
                Password
              </label>
              <a
                href="https://quantmail.in/forgot-password"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] font-medium text-violet-300 transition-colors hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 rounded"
              >
                Forgot password?
              </a>
            </div>
            <div className="relative flex overflow-hidden rounded-xl border border-white/10 bg-zinc-950/70 transition focus-within:border-violet-500/60 focus-within:ring-2 focus-within:ring-violet-500/20">
              <input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-describedby={error ? errorId : undefined}
                aria-invalid={error ? true : undefined}
                className="w-full bg-transparent px-3.5 py-3 pr-11 text-base text-white placeholder-zinc-500 outline-none sm:text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex min-w-[44px] items-center justify-center px-3 text-zinc-400 transition-colors hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60"
              >
                {showPassword ? (
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m9.88 9.88 4.24 4.24" />
                    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                    <line x1="2" x2="22" y1="2" y2="22" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error ? (
            <div
              id={errorId}
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-[13px] text-rose-200"
            >
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            aria-busy={isLoading}
            className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/25 transition hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2" role="status">
                <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Signing in…
              </span>
            ) : (
              'Sign in with Email'
            )}
          </button>
        </form>

        {/* Account creation — honest in-ecosystem flow */}
        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm font-medium text-zinc-200">New to QuantAI?</p>
          <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
            Create a QuantID — one account for QuantAI, QuantMail and QuantChat. You&apos;ll create
            it on QuantMail and come straight back here.
          </p>
          <a
            href="https://quantmail.in/register"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 py-2.5 text-sm font-semibold text-violet-200 transition hover:border-violet-400/60 hover:bg-violet-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60"
          >
            Create a QuantID
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 17 17 7" />
              <path d="M7 7h10v10" />
            </svg>
          </a>
        </div>

        {/* Footer */}
        <p className="mt-6 border-t border-white/[0.06] pt-4 text-center text-xs text-zinc-500">
          Your chats are tied to your Quant account
        </p>
      </main>
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
