'use client';

// ============================================================================
// QuantAI — Sign-in page.
// Unified QuantID authentication: continue with your Quant account or sign in
// with email + password.
// ============================================================================
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { UniversalSSOTokenBridge } from '@quant/shared-ui';
import { useAuth } from '../../providers/auth-provider';
import { ingestSSOToken } from '../../services/auth-session';
import { useBrandName } from '../../components/BrandProvider';
import { NeuralFieldCanvas } from '../../components/auth/NeuralFieldCanvas';
import { scrubSsoHandoffParams } from '../../lib/sso-url-params';
import {
  extractSsoTicket,
  resolveSsoTicket,
  scrubSsoTicketFromAddressBar,
  SsoTicketError,
} from '../../lib/sso-ticket-client';

/** Only allow same-origin, absolute-path returns so ?returnTo cannot open-redirect. */
function safeReturnPath(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

/** Precision-machined geometric AI core lattice vector emblem */
function AICoreLattice() {
  return (
    <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center">
      {/* Outer ambient radiant aura */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-violet-600/40 via-blue-600/30 to-cyan-500/30 blur-xl" />
      {/* Precision faceted obsidian glass tile */}
      <div className="relative flex h-full w-full items-center justify-center rounded-2xl border border-white/20 bg-gradient-to-b from-white/[0.1] to-white/[0.02] p-3 shadow-2xl shadow-violet-950/60 backdrop-blur-xl ring-1 ring-white/10 transition-transform duration-500 hover:scale-105">
        <svg viewBox="0 0 48 48" fill="none" className="h-9 w-9" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="ai-core-grad-1" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
              <stop stopColor="#A78BFA" />
              <stop offset="0.5" stopColor="#60A5FA" />
              <stop offset="1" stopColor="#38BDF8" />
            </linearGradient>
            <linearGradient id="ai-core-grad-2" x1="24" y1="4" x2="24" y2="44" gradientUnits="userSpaceOnUse">
              <stop stopColor="#C084FC" />
              <stop offset="1" stopColor="#3B82F6" />
            </linearGradient>
            <radialGradient id="ai-core-glow" cx="24" cy="24" r="10" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FFFFFF" stopOpacity="0.95" />
              <stop offset="0.4" stopColor="#818CF8" stopOpacity="0.75" />
              <stop offset="1" stopColor="#8B5CF6" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* Outer isometric lattice ring */}
          <rect
            x="8"
            y="8"
            width="32"
            height="32"
            rx="8"
            transform="rotate(45 24 24)"
            stroke="url(#ai-core-grad-1)"
            strokeWidth="1.75"
            strokeDasharray="4 2"
            className="opacity-70"
          />
          {/* Inner octahedral diamond */}
          <polygon
            points="24,6 42,24 24,42 6,24"
            stroke="url(#ai-core-grad-2)"
            strokeWidth="2"
            fill="rgba(139, 92, 246, 0.08)"
          />
          {/* Cross synaptic axis filaments */}
          <line x1="24" y1="11" x2="24" y2="37" stroke="url(#ai-core-grad-1)" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="11" y1="24" x2="37" y2="24" stroke="url(#ai-core-grad-1)" strokeWidth="1.5" strokeLinecap="round" />
          {/* Corner nodes */}
          <circle cx="24" cy="11" r="2" fill="#C084FC" />
          <circle cx="24" cy="37" r="2" fill="#60A5FA" />
          <circle cx="11" cy="24" r="2" fill="#818CF8" />
          <circle cx="37" cy="24" r="2" fill="#38BDF8" />
          {/* Quantum singularity core */}
          <circle cx="24" cy="24" r="5" fill="url(#ai-core-glow)" />
          <circle cx="24" cy="24" r="2.2" fill="#FFFFFF" />
        </svg>
      </div>
    </div>
  );
}

function LoginForm() {
  const brandName = useBrandName();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isLoading, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [twoFactorNotice, setTwoFactorNotice] = useState(false);
  // QuantMail opaque-ticket SSO status: honest loading / error UI for the
  // ticket exchange (the ticket itself is single-use, so failures name the
  // real cause and offer a retry where retrying can help).
  const [ssoStatus, setSsoStatus] = useState<'idle' | 'resolving' | 'error'>('idle');
  const [ssoError, setSsoError] = useState<string | null>(null);
  const ssoTicketRef = useRef<string | null>(null);

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

  // Auto-capture SSO handoffs returned from the QuantMail Account Chooser or
  // Cross-App Jump Bridge.
  //
  // The chooser now redirects with ONLY `?__quant_sso_ticket=` (opaque ticket,
  // QuantMail PR #881): it can never validate as an access token, so it must
  // NOT go through UniversalSSOTokenBridge.consumeHandoffTicket (which
  // bearer-verifies). We POST it to our own backend instead, which resolves it
  // server-to-server with the identity root and mints a QuantAI SSO session.
  // Legacy `?token=` / `?accessToken=` handoffs keep flowing through the
  // shared bridge below.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;

    const exchangeOpaqueTicket = async (ticket: string) => {
      setSsoStatus('resolving');
      setSsoError(null);
      // Read the return path BEFORE scrubbing (__quant_return is scrubbed too).
      const rawReturn = searchParams?.get('returnTo') ?? searchParams?.get('__quant_return');
      // Scrub the single-use ticket from the address bar BEFORE the exchange,
      // regardless of outcome, so it never lingers in history.
      scrubSsoTicketFromAddressBar();
      try {
        const result = await resolveSsoTicket(ticket);
        if (cancelled) return;
        const u = result.user;
        // Store the server-verified identity too — without it the UI falls
        // back to fabricated placeholders.
        ingestSSOToken(result.sessionToken, {
          id: u.id,
          email: u.email,
          name: u.displayName || u.username || undefined,
        });
        setSsoStatus('idle');

        let targetDestination = destination();
        if (rawReturn) {
          try {
            const decoded = decodeURIComponent(rawReturn);
            const validation = UniversalSSOTokenBridge.validateSafeReturnPath(decoded);
            if (validation.isSafe && validation.sanitizedUrl !== '/login') {
              targetDestination = validation.sanitizedUrl;
            }
          } catch {
            // Keep the default destination.
          }
        }
        router.replace(targetDestination);
      } catch (caught) {
        if (cancelled) return;
        // Honest failure: name the real cause. A burned/expired ticket cannot
        // be retried (single-use); network failures can.
        setSsoStatus('error');
        setSsoError(
          caught instanceof SsoTicketError
            ? caught.message
            : 'Sign-in via QuantMail failed. Please try again.',
        );
      }
    };

    const opaqueTicket = extractSsoTicket(window.location.search);
    if (opaqueTicket) {
      // Kept for the "Try again" button — the URL copy is already scrubbed.
      ssoTicketRef.current = opaqueTicket;
      void exchangeOpaqueTicket(opaqueTicket);
      return () => {
        cancelled = true;
      };
    }

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
    return () => {
      cancelled = true;
    };
  }, [router, destination, searchParams]);

  // Retry the ticket exchange (only helps when the first attempt never
  // reached the identity service — e.g. a network timeout. A consumed ticket
  // fails again with the honest "expired" copy above).
  const retrySsoTicketExchange = useCallback(() => {
    const ticket = ssoTicketRef.current;
    if (!ticket || ssoStatus === 'resolving') return;
    setSsoStatus('resolving');
    setSsoError(null);
    resolveSsoTicket(ticket)
      .then((result) => {
        const u = result.user;
        ingestSSOToken(result.sessionToken, {
          id: u.id,
          email: u.email,
          name: u.displayName || u.username || undefined,
        });
        setSsoStatus('idle');
        router.replace(destination());
      })
      .catch((caught: unknown) => {
        setSsoStatus('error');
        setSsoError(
          caught instanceof SsoTicketError
            ? caught.message
            : 'Sign-in via QuantMail failed. Please try again.',
        );
      });
  }, [router, destination, ssoStatus]);

  // "Continue with Quant Account" always performs a real SSO handshake with QuantMail.
  // We deliberately do NOT short-circuit on a locally stored token: reusing a stale/expired
  // local token makes the button appear dead and prevents account switching.
  const handleQuantSSO = useCallback(() => {
    const target = destination();
    const returnParam = target && target !== '/' ? `?returnTo=${encodeURIComponent(target)}` : '';
    const returnTo = encodeURIComponent(`${window.location.origin}/login${returnParam}`);
    // The OAuth client_id registered for QuantAI on the identity root. The
    // ticket minted by /sso is bound to this client, and the server-to-server
    // exchange verifies the binding — so this MUST be the registered id, not
    // a display name.
    const clientId = process.env.NEXT_PUBLIC_QUANT_SSO_CLIENT_ID ?? 'quantai';
    window.location.href = `https://quantmail.in/sso?returnTo=${returnTo}&client_id=${encodeURIComponent(clientId)}`;
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
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#06070B] px-4 py-12 text-white selection:bg-violet-500/30">
      {/* 1. Ambient WebGL/Canvas Neural Synaptic Fluid Particle Field */}
      <NeuralFieldCanvas className="opacity-60" particleCount={56} interactive={true} />

      {/* 2. Layered Deep Space Radial Auras */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 h-[550px] w-[880px] -translate-x-1/2 rounded-full bg-gradient-to-b from-violet-600/15 via-blue-600/10 to-transparent blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-48 left-1/2 h-[450px] w-[700px] -translate-x-1/2 rounded-full bg-gradient-to-t from-cyan-600/10 via-violet-600/5 to-transparent blur-3xl"
      />

      {/* 3. Central Executive Frosted Glass Console */}
      <div className="relative z-10 w-full max-w-[440px] rounded-3xl border border-white/10 bg-white/[0.03] p-7 sm:p-9 shadow-[0_24px_80px_rgba(0,0,0,0.85),0_0_60px_rgba(139,92,246,0.06)] backdrop-blur-2xl ring-1 ring-white/5">
        {/* Header Section */}
        <div className="mb-7 text-center">
          <AICoreLattice />

          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-[25px]">
            QuantAI
          </h1>
          <p className="mt-1.5 text-xs font-normal tracking-wide text-zinc-400 sm:text-[13px]">
            Sign in to chat with AI
          </p>
        </div>

        {/* 2FA Notice */}
        {twoFactorNotice ? (
          <div
            role="status"
            className="mb-5 flex items-start gap-3 rounded-2xl border border-violet-500/30 bg-violet-500/10 p-3.5 text-xs leading-relaxed text-violet-200"
          >
            <svg
              className="mt-0.5 h-4 w-4 shrink-0 text-violet-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>
              This account uses two-factor authentication. Finish signing in on QuantMail, then reopen{' '}
              {brandName} — your session carries over.
            </span>
          </div>
        ) : null}

        {/* Hero SSO Button with Obsidian-Titanium Sheen & Animated Border Refraction */}
        <div className="relative mb-5">
          <div className="group relative overflow-hidden rounded-2xl p-[1px] transition-all duration-300 hover:shadow-[0_0_28px_rgba(139,92,246,0.25)]">
            {/* Animated border refraction glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-violet-600 via-indigo-500 to-cyan-500 opacity-60 transition-opacity duration-300 group-hover:opacity-100" />

            {/* Inner obsidian-titanium button body */}
            <button
              type="button"
              onClick={handleQuantSSO}
              className="relative flex w-full items-center justify-center gap-2.5 rounded-[15px] bg-gradient-to-b from-[#181924] to-[#0d0e15] px-5 py-3.5 text-sm font-semibold text-white shadow-xl shadow-black/50 transition-all duration-200 group-hover:from-[#212332] group-hover:to-[#12131d] active:scale-[0.99]"
            >
              {/* Luxury sheen sweep overlay */}
              <div className="pointer-events-none absolute inset-0 rounded-[15px] bg-gradient-to-tr from-white/[0.03] via-transparent to-white/[0.08]" />

              {/* Pure SVG lightning bolt vector (zero raw Unicode emojis) */}
              <svg
                className="h-4 w-4 text-violet-400 transition-transform duration-300 group-hover:scale-110 group-hover:text-violet-300"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" fill="currentColor" fillOpacity="0.25" />
              </svg>

              <span>Continue with Quant Account</span>
            </button>
          </div>
        </div>

        {/* QuantMail SSO ticket status — honest loading / error state for the
            opaque-ticket exchange (never a silent dead-end). */}
        {ssoStatus !== 'idle' ? (
          <div
            role={ssoStatus === 'error' ? 'alert' : 'status'}
            aria-live="polite"
            className={
              ssoStatus === 'error'
                ? 'mb-5 flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs leading-relaxed text-red-200'
                : 'mb-5 flex items-center gap-3 rounded-2xl border border-violet-500/30 bg-violet-500/10 p-3.5 text-xs leading-relaxed text-violet-200'
            }
          >
            {ssoStatus === 'resolving' ? (
              <>
                <svg
                  className="h-4 w-4 shrink-0 animate-spin text-violet-300"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                  <path
                    d="M22 12a10 10 0 0 1-10 10"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
                <span>Signing you in via QuantMail…</span>
              </>
            ) : (
              <>
                <svg
                  className="mt-0.5 h-4 w-4 shrink-0 text-red-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span className="flex-1">{ssoError ?? 'Sign-in via QuantMail failed.'}</span>
                <button
                  type="button"
                  onClick={retrySsoTicketExchange}
                  className="shrink-0 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 font-semibold text-white transition-colors hover:bg-white/10"
                >
                  Try again
                </button>
              </>
            )}
          </div>
        ) : null}

        {/* Clean Minimalist Divider */}
        <div className="relative my-6 flex items-center justify-center">
          <div className="w-full border-t border-white/[0.08]" />
          <span className="absolute bg-[#090a10] px-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            or credentials
          </span>
        </div>

        {/* High-Density Credentials Form */}
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label
              htmlFor="login-email"
              className="mb-1.5 block text-[13px] font-medium text-zinc-300"
            >
              Email address
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-500">
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="20" height="16" x="2" y="4" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
              </div>
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
                className="w-full rounded-xl border border-white/10 bg-black/40 py-2.5 pl-10 pr-3.5 text-sm text-white placeholder-zinc-500 outline-none transition duration-200 focus:border-violet-500/60 focus:bg-black/60 focus:ring-2 focus:ring-violet-500/20"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="mb-1.5 block text-[13px] font-medium text-zinc-300"
            >
              Password
            </label>
            <div className="relative flex overflow-hidden rounded-xl border border-white/10 bg-black/40 transition duration-200 focus-within:border-violet-500/60 focus-within:bg-black/60 focus-within:ring-2 focus-within:ring-violet-500/20">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-500">
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full bg-transparent py-2.5 pl-10 pr-10 text-sm text-white placeholder-zinc-500 outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-zinc-400 transition-colors hover:text-zinc-200"
              >
                {showPassword ? (
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m9.88 9.88 4.24 4.24" />
                    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                    <line x1="2" x2="22" y1="2" y2="22" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ) : (
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200"
            >
              <svg
                className="mt-0.5 h-4 w-4 shrink-0 text-rose-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
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
            className="w-full rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-violet-600 bg-[length:200%_auto] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition-all duration-300 hover:bg-[position:right_center] hover:shadow-violet-600/35 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
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

        {/* Footer Link & Ecosystem Notice */}
        <div className="mt-6 text-center">
          <p className="text-xs text-zinc-400">
            New to the ecosystem?{' '}
            <a
              href="https://quantmail.in/register"
              className="font-medium text-violet-400 underline-offset-4 transition hover:text-violet-300 hover:underline"
            >
              Create a QuantID
            </a>
          </p>

          <div className="mt-5 flex items-center justify-center gap-1.5 border-t border-white/[0.06] pt-4 text-[11px] text-zinc-500">
            <span>Your chats are tied to your Quant account</span>
          </div>
        </div>
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
