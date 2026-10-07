'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UniversalSSOTokenBridge, useAuth } from '@quant/shared-ui';
import { apiClient } from '../../services/api-client';
import { persistSession } from '../../lib/auth-session';
import { CryptographicMeshCanvas } from './CryptographicMeshCanvas';
import { apiFetchRaw } from '@quant/api-client';

// QuantMail SSO base URL (overridable per environment)
const SSO_BASE_URL = process.env.NEXT_PUBLIC_QUANTMAIL_SSO_URL || 'https://quantmail.in';

export interface LoginPageProps {
  params?: Promise<Record<string, string | string[] | undefined>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/* ============================================================================
   ZERO-EMOJI LUXURY CRYPTOGRAPHIC VECTOR ASSETS (Signal / WhatsApp / Telegram)
   ============================================================================ */

export function CryptographicBeaconIcon({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="beacon-grad-outer" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="50%" stopColor="#06B6D4" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>
        <linearGradient id="beacon-grad-core" x1="16" y1="16" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#06B6D4" />
        </linearGradient>
        <radialGradient id="beacon-glow" cx="24" cy="24" r="14" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#10B981" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#080B12" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Radial soft core glow */}
      <circle cx="24" cy="24" r="14" fill="url(#beacon-glow)" />

      {/* Signal-class Sovereign Shield Outer Geometry */}
      <path
        d="M24 3.5L39.5 9.5V23C39.5 32.5 32.5 40.8 24 44.5C15.5 40.8 8.5 32.5 8.5 23V9.5L24 3.5Z"
        stroke="url(#beacon-grad-outer)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Concentric Cryptographic Lattice */}
      <path
        d="M24 9L35 13.5V23C35 30 29.5 36.5 24 39.5C18.5 36.5 13 30 13 23V13.5L24 9Z"
        stroke="#10B981"
        strokeWidth="0.75"
        strokeOpacity="0.4"
        strokeDasharray="2 2"
      />

      {/* Precision Double-Ratchet Geometric Diamond Beacon */}
      <path
        d="M24 14L32 24L24 34L16 24L24 14Z"
        fill="url(#beacon-grad-core)"
        fillOpacity="0.18"
        stroke="url(#beacon-grad-core)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* Core Cryptographic Beacon Anchor */}
      <circle cx="24" cy="24" r="3" fill="#34D399" />
      <circle cx="24" cy="24" r="1" fill="#FFFFFF" />

      {/* Micro Cryptographic Crosshairs */}
      <path d="M24 11V14M24 34V37M11 24H14M34 24H37" stroke="#34D399" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.6" />
    </svg>
  );
}

export function LightningIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M13 2L3 14h8l-2 8 10-12h-8l2-8z" />
    </svg>
  );
}

export function KeyIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M10.5 12.5L20 3M16 7l2 2M18 5l2 2" />
    </svg>
  );
}

export function ShieldCheckIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function DevicesIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="2" y="4" width="14" height="11" rx="2" />
      <path d="M6 19h6" />
      <rect x="15" y="8" width="7" height="12" rx="1.5" />
      <path d="M18.5 17h.01" />
    </svg>
  );
}

export function LockKeyholeIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
      <circle cx="12" cy="16" r="1.5" />
    </svg>
  );
}

export function ArrowRightIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

export default function LoginPage(props: LoginPageProps) {
  void props;
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  // Single sign-in path: Quant Account (QuantMail SSO) is primary;
  // password login is a subtle inline fallback, no tab switching.
  const [showPassword, setShowPassword] = useState(false);
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
        // decodeUnverifiedHandoffTicket only UNWRAPS the client-side ticket envelope
        // to find the wrapped token — it verifies nothing. The token is verified
        // server-side by /api/auth/sso/exchange below (fail closed).
        const ssoToken =
          (ticketParam
            ? bridge.decodeUnverifiedHandoffTicket(ticketParam)?.token || ticketParam
            : null) || tokenParam;

        if (!ssoToken) return;

        setBusy(true);
        setError(null);
        const res = await apiFetchRaw('/api/auth/sso/exchange', {
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
    <main className="min-h-dvh flex flex-col items-center justify-center bg-[#080B12] relative overflow-hidden px-4 py-8 font-sans text-slate-200">
      {/* WebGL/Canvas Cryptographic Constellation Mesh */}
      <CryptographicMeshCanvas />

      {/* Subtle Ambient Glows: Emerald & Violet */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-violet-600/15 rounded-full blur-[120px] pointer-events-none" />

      {/* Trust badges and crypto claims removed: every word must be provable truth. */}

      {/* Main Glassmorphic Card Container */}
      <div className="w-full max-w-md backdrop-blur-2xl bg-[#0B101B]/80 border border-white/10 rounded-3xl p-8 shadow-2xl shadow-emerald-950/20 relative z-10">
        {/* Brand Beacon & Typography */}
        <div className="text-center space-y-4 mb-6">
          <div className="relative mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-400/25 via-cyan-500/20 to-indigo-500/25 p-[1.5px] shadow-[0_0_35px_rgba(16,185,129,0.25)]">
            <div className="w-full h-full bg-[#080B12] rounded-[15px] flex items-center justify-center relative overflow-hidden">
              <CryptographicBeaconIcon className="w-12 h-12 relative z-10" />
            </div>
            <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-[#080B12] animate-pulse shadow-[0_0_12px_rgba(52,211,153,0.9)]" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              QuantChat Sovereign Communications
            </h1>
            <p className="text-sm text-slate-400 mt-1.5">
              Sign in to QuantChat. Use your QuantMail account to continue.
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

        {/* PRIMARY: Continue with Quant Account (QuantMail SSO) with Molten Glow */}
        <div className="relative group mb-5">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-xl blur opacity-60 group-hover:opacity-100 transition duration-300 group-hover:duration-200 animate-pulse pointer-events-none" />
          <button
            type="button"
            data-testid="quant-sso-primary-btn"
            onClick={handleQuantSSO}
            disabled={busy}
            className="relative w-full flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 py-3.5 px-4 font-semibold text-white transition-all duration-200 hover:brightness-110 active:scale-[0.99] disabled:opacity-50 shadow-lg shadow-emerald-500/25 cursor-pointer overflow-hidden"
          >
            <span className="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[-25deg] -translate-x-full group-hover:translate-x-[300%] transition-transform duration-1000 ease-out" />
            <LightningIcon className="w-4 h-4 text-emerald-200" />
            <span className="tracking-wide">Continue with Quant Account</span>
            <ArrowRightIcon className="w-4 h-4 text-emerald-200 ml-1 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>

        {/* Subtle secondary fallback: password login, expanded inline */}
        <div
          className="flex items-center gap-3 mb-2"
          role="separator"
          aria-label="or sign in with email and password"
        >
          <div className="flex-1 h-px bg-white/10" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-expanded={showPassword}
            className="text-xs text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer"
          >
            or sign in with email &amp; password
          </button>
          <div className="flex-1 h-px bg-white/10" aria-hidden="true" />
        </div>

        {/* Password fallback form: rendered inline, toggled by the link above */}
        <div className={showPassword ? 'block' : 'hidden'}>
          <form className="space-y-4" onSubmit={handlePasswordLogin}>
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
              className="w-full rounded-xl bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 hover:from-emerald-500/30 hover:to-cyan-500/30 border border-emerald-500/30 py-3 font-semibold text-white transition-all disabled:opacity-50 cursor-pointer shadow-md shadow-emerald-950/30"
              data-testid="submit-password-btn"
            >
              {busy ? 'Signing in…' : 'Sign in to QuantChat'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setShowPassword(false)}
              className="text-xs text-slate-400 hover:text-emerald-400 transition-colors inline-flex items-center gap-1 cursor-pointer"
            >
              <LightningIcon className="w-3 h-3 text-emerald-400" />
              <span>Back to Quant Account</span>
            </button>
          </div>
        </div>

      </div>

      {/* Legal Links — WhatsApp / Telegram standard */}
      <div className="mt-8 flex items-center justify-center gap-4 text-[11px] text-slate-500 relative z-10">
        <a href="/terms" className="hover:text-slate-300 transition-colors">
          Terms
        </a>
        <span className="text-slate-700">·</span>
        <a href="/privacy" className="hover:text-slate-300 transition-colors">
          Privacy Policy
        </a>
        <span className="text-slate-700">·</span>
        <a href="/support" className="hover:text-slate-300 transition-colors">
          Support
        </a>
      </div>
    </main>
  );
}
