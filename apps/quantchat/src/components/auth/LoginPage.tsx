'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UniversalSSOTokenBridge, useAuth } from '@quant/shared-ui';
import { apiClient } from '../../services/api-client';
import { persistSession } from '../../lib/auth-session';

// QuantMail SSO base URL (overridable per environment)
const SSO_BASE_URL = process.env.NEXT_PUBLIC_QUANTMAIL_SSO_URL || 'https://quantmail.in';

export interface LoginPageProps {
  params?: Promise<Record<string, string | string[] | undefined>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default function LoginPage(props: LoginPageProps) {
  void props;
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Auto-redirect if already authenticated or session restored
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, router]);

  // Auto-capture SSO tokens returned from QuantMail Account Chooser or Cross-App Jump Bridge.
  // The token in the URL is a QuantMail-issued JWT, which is NOT valid for
  // QuantChat's backend (different secret/issuer/audience). We MUST exchange it
  // server-side for QuantChat-native tokens first — storing the raw QuantMail
  // JWT caused /auth/me 401s, fail-closed session clears, and a bounce back to
  // /login on every SSO attempt.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const ticketParam = params.get('__quant_sso_ticket');
        const tokenParam =
          params.get('token') || params.get('accessToken') || params.get('access_token');
        const rawReturn = params.get('returnTo') || params.get('__quant_return');

        const bridge = UniversalSSOTokenBridge.getInstance();
        const ssoToken =
          (ticketParam ? bridge.verifyHandoffTicket(ticketParam)?.token || ticketParam : null) ||
          tokenParam;

        if (!ssoToken) return;

        setBusy(true);
        setError(null);
        const res = await fetch('/api/auth/sso/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ssoToken }),
        });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !data?.success || !data?.data?.accessToken) {
          setError('Quant Account sign-in failed. Please try again.');
          try {
            const url = new URL(window.location.href);
            url.searchParams.delete('__quant_sso_ticket');
            url.searchParams.delete('token');
            url.searchParams.delete('accessToken');
            url.searchParams.delete('access_token');
            window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : ''));
          } catch {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
          return;
        }

        // Store only the valid, backend-exchanged QuantChat tokens.
        persistSession(data.data.accessToken, data.data.refreshToken || data.data.accessToken);
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete('__quant_sso_ticket');
          url.searchParams.delete('token');
          url.searchParams.delete('accessToken');
          url.searchParams.delete('access_token');
          url.searchParams.delete('__quant_return');
          const cleanUrl = url.pathname + (url.search ? url.search : '') + url.hash;
          window.history.replaceState({}, document.title, cleanUrl);
        } catch {
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        let targetDestination = '/';
        if (rawReturn) {
          const decoded = decodeURIComponent(rawReturn);
          const validation = UniversalSSOTokenBridge.validateSafeReturnPath(decoded);
          if (validation.isSafe && validation.sanitizedUrl !== '/login') {
            targetDestination = validation.sanitizedUrl;
          }
        }
        router.replace(targetDestination);
      } catch {
        if (!cancelled) {
          setError('Quant Account sign-in failed. Please try again.');
          try {
            window.history.replaceState({}, document.title, window.location.pathname);
          } catch {
            /* ignore */
          }
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // "Continue with Quant Account" always performs a real SSO handshake with
  // QuantMail. We deliberately do NOT short-circuit on a locally stored token:
  // reusing a stale/expired local token made the button appear dead (it just
  // navigated to '/' with the old session) and made account switching
  // impossible. QuantMail's chooser shows the signed-in account for 1-click
  // continue, which is the correct fast path.
  const handleQuantSSO = useCallback(() => {
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const currentReturn = params?.get('returnTo');
    const returnParam =
      currentReturn && currentReturn !== '/login'
        ? `?returnTo=${encodeURIComponent(currentReturn)}`
        : '';
    const returnTo = encodeURIComponent(`${window.location.origin}/login${returnParam}`);
    window.location.href = `${SSO_BASE_URL}/sso?returnTo=${returnTo}&client_id=quantchat`;
  }, []);

  const handlePasswordLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setInfo(null);
      if (!identifier.trim()) {
        setError('Enter your email or username');
        return;
      }
      if (!password) {
        setError('Enter your password');
        return;
      }
      setBusy(true);
      try {
        const res = await apiClient.loginWithPassword({
          identifier: identifier.trim(),
          password,
        });
        if (!res.success || !res.data) {
          setError(res.error?.message ?? 'Invalid credentials');
          return;
        }
        persistSession(res.data.accessToken, res.data.refreshToken);
        router.replace('/');
      } catch {
        setError('Network error. Please try again.');
      } finally {
        setBusy(false);
      }
    },
    [identifier, password, router],
  );

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#090D16] relative overflow-hidden px-4 font-sans text-slate-200">
      {/* Subtle Ambient Glows: Emerald & Violet */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-violet-600/15 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md backdrop-blur-2xl bg-white/[0.03] border border-white/10 rounded-3xl p-8 shadow-2xl shadow-emerald-950/20 relative z-10">
        <div className="text-center space-y-4 mb-8">
          <div className="relative mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-indigo-500 p-[2px] shadow-lg shadow-emerald-500/20">
            <div className="w-full h-full bg-[#090D16] rounded-[14px] flex items-center justify-center">
              <span className="text-transparent bg-clip-text bg-gradient-to-br from-emerald-400 to-indigo-500 text-3xl font-bold">
                Q
              </span>
            </div>
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-[#090D16] animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Sign in to QuantChat</h1>
            <p className="text-sm text-slate-400 mt-1">
              Use your QuantMail account to continue.
            </p>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
          >
            {error}
          </div>
        )}
        {info && !error && (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
            {info}
          </div>
        )}

        {/* PRIMARY: Continue with Quant Account (QuantMail SSO) */}
        <button
          type="button"
          data-testid="quant-sso-primary-btn"
          onClick={handleQuantSSO}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-3.5 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 shadow-lg shadow-emerald-500/20 cursor-pointer mb-6"
        >
          <span>⚡</span>
          <span>Continue with Quant Account</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-6" role="separator" aria-label="or sign in with email and password">
          <div className="flex-1 h-px bg-white/10" aria-hidden="true" />
          <span className="text-xs text-slate-500">or sign in with email &amp; password</span>
          <div className="flex-1 h-px bg-white/10" aria-hidden="true" />
        </div>

        {/* SECONDARY: QuantMail email/username + password */}
        <form className="space-y-5" onSubmit={handlePasswordLogin}>
          <div className="space-y-1.5">
            <label htmlFor="identifier" className="block text-xs font-medium text-slate-400">
              Email or Username
            </label>
            <input
              id="identifier"
              type="text"
              autoComplete="username"
              placeholder="user@quantmail.in"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50 focus:bg-white/[0.05] transition-all"
              data-testid="identifier-input"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-xs font-medium text-slate-400">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50 focus:bg-white/[0.05] transition-all"
              data-testid="password-input"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 py-3 font-semibold text-white transition-colors disabled:opacity-50 cursor-pointer"
            data-testid="submit-password-btn"
          >
            {busy ? 'Signing in…' : 'Sign in to QuantChat'}
          </button>
        </form>
      </div>

      {/* Legal links — WhatsApp/Telegram standard */}
      <div className="mt-8 flex items-center justify-center gap-4 text-[11px] text-slate-500">
        <a href="/terms" className="hover:text-slate-300 transition-colors">Terms</a>
        <span className="text-slate-700">·</span>
        <a href="/privacy" className="hover:text-slate-300 transition-colors">Privacy Policy</a>
        <span className="text-slate-700">·</span>
        <a href="/support" className="hover:text-slate-300 transition-colors">Support</a>
      </div>
    </main>
  );
}
