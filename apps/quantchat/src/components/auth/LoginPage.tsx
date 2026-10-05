'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UniversalSSOTokenBridge } from '@quant/shared-ui';
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
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Auto-capture SSO tokens returned from QuantMail Account Chooser or Cross-App Jump Bridge
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const bridge = UniversalSSOTokenBridge.getInstance();
      const consumed = bridge.consumeHandoffTicket();
      const params = new URLSearchParams(window.location.search);
      const ticketParam = params.get('__quant_sso_ticket');
      const tokenParam =
        params.get('token') || params.get('accessToken') || params.get('access_token');
      const refreshToken =
        params.get('refreshToken') || params.get('refresh_token') || tokenParam || '';
      const rawReturn =
        consumed?.returnPath || params.get('returnTo') || params.get('__quant_return');

      const resolvedToken =
        consumed?.session?.token ||
        consumed?.ticket ||
        (ticketParam ? bridge.verifyHandoffTicket(ticketParam)?.token || ticketParam : null) ||
        tokenParam;

      if (resolvedToken) {
        persistSession(resolvedToken, refreshToken || resolvedToken);
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);

        let targetDestination = '/';
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
  }, [router]);

  const handleQuantSSO = useCallback(() => {
    try {
      const stored =
        localStorage.getItem('quant_access_token') ||
        localStorage.getItem('quant_auth_token') ||
        localStorage.getItem('token') ||
        localStorage.getItem('quant_token') ||
        localStorage.getItem('quantchat_access_token');
      if (stored) {
        persistSession(stored, stored);
        router.replace('/');
        return;
      }
    } catch {}
    const returnTo = encodeURIComponent(window.location.origin + '/login');
    window.location.href = `${SSO_BASE_URL}/sso?returnTo=${returnTo}&client_id=quantchat`;
  }, [router]);

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
