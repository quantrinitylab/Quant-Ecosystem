// ============================================================================
// QuantGram Creator Media — High-Fashion Creator Sign-In
// Iridescent Fluid Aurora Canvas · Creator Rev-Share · Sovereign Identity
// ============================================================================
import React, { useCallback, useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../providers/auth-provider';
import { UniversalSSOTokenBridge } from '@quant/shared-ui';
import { AuroraMeshCanvas } from '../components/auth/AuroraMeshCanvas';

/** Only allow same-origin, absolute-path returns so ?returnTo cannot open-redirect. */
function safeReturnPath(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

// ============================================================================
// PURE SVG ICONS (Zero Unicode Emojis Invariant)
// ============================================================================

function LightningIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function EyeIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function GridIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function VideoIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" fillOpacity="0.2" />
      <path d="M5 3l14 9-14 9V3z" />
    </svg>
  );
}

function ShieldCheckIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function SparklesIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" />
    </svg>
  );
}

function LegalIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

// ============================================================================
// PRECISION GEOMETRIC APERTURE / CAMERA PRISM VECTOR MARK
// ============================================================================

function GeometricAperturePrism({ className = 'w-16 h-16' }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* Outer ambient glow halo */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#FF5E62] via-[#D946EF] to-[#FF8C42] blur-xl opacity-60 animate-pulse" />

      {/* Precision Lens Barrel & Iris Geometry */}
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-10 w-full h-full drop-shadow-[0_4px_24px_rgba(217,70,239,0.35)]"
      >
        <defs>
          <linearGradient id="qgApertureGrad" x1="10" y1="10" x2="90" y2="90" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FF5E62" />
            <stop offset="30%" stopColor="#D946EF" />
            <stop offset="70%" stopColor="#FF8C42" />
            <stop offset="100%" stopColor="#7C3AED" />
          </linearGradient>
          <linearGradient id="qgBladeGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.12" />
          </linearGradient>
          <radialGradient id="qgPrismCore" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="40%" stopColor="#FF8C42" stopOpacity="0.75" />
            <stop offset="70%" stopColor="#D946EF" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#7C3AED" stopOpacity="0.1" />
          </radialGradient>
        </defs>

        {/* Outer chassis ring */}
        <circle cx="50" cy="50" r="46" stroke="url(#qgApertureGrad)" strokeWidth="2.2" strokeOpacity="0.9" />
        <circle cx="50" cy="50" r="41" stroke="rgba(255, 255, 255, 0.2)" strokeWidth="1" strokeDasharray="3 3" />

        {/* Millimeter lens calibration tick marks */}
        <line x1="50" y1="4" x2="50" y2="9" stroke="#FF5E62" strokeWidth="2" strokeLinecap="round" />
        <line x1="96" y1="50" x2="91" y2="50" stroke="#FF8C42" strokeWidth="2" strokeLinecap="round" />
        <line x1="50" y1="96" x2="50" y2="91" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" />
        <line x1="4" y1="50" x2="9" y2="50" stroke="#D946EF" strokeWidth="2" strokeLinecap="round" />

        {/* Interlocking Iris Aperture Blades */}
        <path d="M 50 15 L 73 33 L 60 48 Z" fill="url(#qgBladeGrad)" fillOpacity="0.25" stroke="url(#qgApertureGrad)" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M 85 50 L 67 73 L 52 60 Z" fill="url(#qgBladeGrad)" fillOpacity="0.25" stroke="url(#qgApertureGrad)" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M 50 85 L 27 67 L 40 52 Z" fill="url(#qgBladeGrad)" fillOpacity="0.25" stroke="url(#qgApertureGrad)" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M 15 50 L 33 27 L 48 40 Z" fill="url(#qgBladeGrad)" fillOpacity="0.25" stroke="url(#qgApertureGrad)" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M 73 33 L 85 50 L 65 52 Z" fill="url(#qgBladeGrad)" fillOpacity="0.32" stroke="url(#qgApertureGrad)" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M 27 67 L 15 50 L 35 48 Z" fill="url(#qgBladeGrad)" fillOpacity="0.32" stroke="url(#qgApertureGrad)" strokeWidth="1.2" strokeLinejoin="round" />

        {/* Central Hexagonal Prism Crystal */}
        <polygon points="50,34 64,42 64,58 50,66 36,58 36,42" stroke="#ffffff" strokeWidth="1.6" fill="url(#qgPrismCore)" />
        <circle cx="50" cy="50" r="4.5" fill="#ffffff" />
      </svg>
    </div>
  );
}

// ============================================================================
// LOGIN PAGE COMPONENT
// ============================================================================

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [twoFactorNotice, setTwoFactorNotice] = useState(false);

  const destination = useCallback(
    () => safeReturnPath(router.query.returnTo) ?? '/',
    [router.query.returnTo],
  );

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      void router.replace(destination());
      return;
    }
    // Check if we have an active session or a token in URL/Storage.
    // Fail-closed: consumeHandoffTicket re-verifies the ticket's token
    // server-side and returns null for forged/tampered/expired tickets.
    // (Uses the shared bridge import — the old (window as any) global was
    // never set and always evaluated to undefined.)
    (async () => {
      const ssoResult =
        typeof window !== 'undefined'
          ? await UniversalSSOTokenBridge.getInstance().consumeHandoffTicket()
          : null;

      if (ssoResult?.ticket) {
        void router.replace(destination());
      }
    })();
  }, [isAuthenticated, isLoading, destination, router]);

  const handleQuantSSO = useCallback(() => {
    const target = destination();
    const returnParam = target && target !== '/' ? `?returnTo=${encodeURIComponent(target)}` : '';
    const returnTo = encodeURIComponent(`${window.location.origin}/login${returnParam}`);
    window.location.href = `https://quantmail.in/sso?returnTo=${returnTo}&client_id=quantgram`;
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
      void router.push(destination());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in failed. Try again.');
    }
  }

  const ssoDirectUrl = `https://quantmail.in/sso?returnTo=${encodeURIComponent(
    typeof window !== 'undefined' ? `${window.location.origin}${destination()}` : 'https://quantgram.quantrinity.in/',
  )}&client_id=quantgram`;

  return (
    <>
      <Head>
        <title>QuantGram Creator Media — Sign In</title>
        <meta
          name="description"
          content="QuantGram Creator Media: High-Octane Reels, Visual Stories, Sovereign Monetization."
        />
      </Head>

      {/* 1. Dynamic Iridescent Fluid Aurora Canvas Backdrop */}
      <AuroraMeshCanvas />

      {/* Main Container */}
      <div className="relative min-h-screen w-full flex flex-col justify-between items-center px-4 py-8 sm:py-12 z-10 text-white selection:bg-[#D946EF]/30 selection:text-white">
        
        {/* Top Minimal Brand Bar */}
        <header className="w-full max-w-6xl mx-auto flex items-center justify-between py-2">
          <Link href="/" className="flex items-center gap-2.5 group">
            <GeometricAperturePrism className="w-8 h-8" />
            <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent group-hover:from-white group-hover:to-[#FF8C42] transition-colors">
              QuantGram
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white/5 border border-white/10 text-zinc-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              Sovereign Creator Protocol
            </span>
          </div>
        </header>

        {/* Centerpiece: Split Showcase on Desktop, Luxury Frosted Glass on Mobile */}
        <main className="w-full max-w-5xl mx-auto my-auto py-6 sm:py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          
          {/* Left Column (Desktop Hero / Creator Pitch) */}
          <section className="lg:col-span-6 flex flex-col items-center lg:items-start text-center lg:text-left space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-[#FF5E62]/15 via-[#D946EF]/15 to-[#FF8C42]/15 border border-white/15 backdrop-blur-md">
              <SparklesIcon className="w-4 h-4 text-[#FF8C42]" />
              <span className="text-xs font-semibold tracking-wider uppercase text-zinc-200">
                Next-Gen Creator Economy
              </span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-center lg:justify-start gap-3">
                <GeometricAperturePrism className="w-12 h-12" />
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white via-zinc-100 to-zinc-300 bg-clip-text text-transparent">
                  QuantGram Creator Media
                </h1>
              </div>
              <p className="text-base sm:text-lg font-medium text-zinc-300">
                High-Octane Reels · Visual Stories · Sovereign Monetization
              </p>
            </div>

            {/* Creator Stats Banner */}
            <div className="w-full p-4 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/10 shadow-xl space-y-2.5">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-zinc-400">
                <span>Network Performance Standards</span>
                <span className="text-emerald-400">Live</span>
              </div>
              <div className="text-sm sm:text-base font-semibold tracking-wide bg-gradient-to-r from-[#FF8C42] via-[#FF5E62] to-[#D946EF] bg-clip-text text-transparent">
                70% Direct Rev-Share · Zero Algorithm Censorship · 4K 120fps Streaming
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5 text-xs text-zinc-300">
                <div className="flex items-center gap-1.5">
                  <ShieldCheckIcon className="w-3.5 h-3.5 text-[#FF5E62] shrink-0" />
                  <span className="truncate">Instant Payouts</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <SparklesIcon className="w-3.5 h-3.5 text-[#D946EF] shrink-0" />
                  <span className="truncate">Web3 Sovereignty</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <VideoIcon className="w-3.5 h-3.5 text-[#FF8C42] shrink-0" />
                  <span className="truncate">Lossless Codec</span>
                </div>
              </div>
            </div>

            {/* Feature Highlights Pills */}
            <div className="hidden lg:flex flex-wrap gap-2 text-xs text-zinc-400">
              <span className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/5">
                Multi-Stop AR Filters
              </span>
              <span className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/5">
                Vanish Mode Encrypted DMs
              </span>
              <span className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/5">
                Live Collab Stages
              </span>
            </div>
          </section>

          {/* Right Column (High-Fashion Frosted Glass Login Card) */}
          <section className="lg:col-span-6 w-full max-w-md mx-auto">
            <div className="relative rounded-3xl p-6 sm:p-8 bg-[#11131A]/85 backdrop-blur-2xl border border-white/10 shadow-2xl transition-all duration-300 hover:border-white/20">
              
              {/* Card Header */}
              <div className="mb-6 text-center">
                <div className="mx-auto mb-3 flex items-center justify-center">
                  <GeometricAperturePrism className="w-14 h-14" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-white">
                  Sign in to QuantGram
                </h2>
                <p className="mt-1.5 text-sm text-zinc-400">
                  Use your QuantID — one account for the whole ecosystem.
                </p>
              </div>

              {/* Hero SSO Button with Vibrant Gradient Border and Molten Amber Sheen */}
              <div className="mb-6">
                <a
                  href={ssoDirectUrl}
                  className="group relative flex w-full items-center justify-center overflow-hidden rounded-2xl p-[1px] font-semibold transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] shadow-lg shadow-[#FF8C42]/20 hover:shadow-[#FF8C42]/40"
                >
                  {/* Vibrant Iridescent Gradient Border */}
                  <span className="absolute inset-0 bg-gradient-to-r from-[#FF5E62] via-[#FF8C42] to-[#D946EF] transition-all duration-500 opacity-90 group-hover:opacity-100" />
                  
                  {/* Inner Surface with Molten Sheen */}
                  <span className="relative flex w-full items-center justify-center gap-2.5 rounded-[15px] bg-[#151722]/95 px-5 py-3.5 transition-colors group-hover:bg-[#181B28]/90">
                    {/* Molten amber shimmer sweep */}
                    <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-[#FF8C42]/30 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                    
                    <LightningIcon className="h-5 w-5 text-[#FF8C42] drop-shadow-[0_0_8px_rgba(255,140,66,0.8)]" />
                    <span className="text-sm font-semibold tracking-wide text-white">
                      Continue with Quant Account
                    </span>
                  </span>
                </a>
              </div>

              {/* Clean Divider */}
              <div className="mb-6 flex items-center justify-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-[11px] font-semibold tracking-wider uppercase text-zinc-400">
                  OR WITH QUANT ID / EMAIL
                </span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              {/* Two-Factor Authentication Status Notice */}
              {twoFactorNotice ? (
                <div
                  role="status"
                  className="mb-5 rounded-2xl border border-[#D946EF]/40 bg-[#D946EF]/10 px-4 py-3 text-sm text-zinc-200"
                >
                  This account uses two-factor authentication. Finish signing in on QuantMail, then reopen QuantGram — your session carries over.
                </div>
              ) : null}

              {/* Form */}
              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <div>
                  <label
                    htmlFor="login-email"
                    className="mb-1.5 block text-[13px] font-medium text-zinc-300"
                  >
                    Email
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    required
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="creator@quantmail.in"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-[#161823]/80 px-4 py-3 text-sm text-white outline-none transition-all placeholder:text-zinc-500 focus:border-[#FF8C42] focus:bg-[#161823] focus:ring-2 focus:ring-[#FF8C42]/20"
                  />
                </div>

                <div>
                  <label
                    htmlFor="login-password"
                    className="mb-1.5 block text-[13px] font-medium text-zinc-300"
                  >
                    Password
                  </label>
                  <div className="flex overflow-hidden rounded-2xl border border-white/10 bg-[#161823]/80 transition-all focus-within:border-[#FF8C42] focus-within:bg-[#161823] focus-within:ring-2 focus-within:ring-[#FF8C42]/20">
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      className="flex items-center gap-1.5 px-4 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
                    >
                      {showPassword ? (
                        <>
                          <EyeOffIcon className="w-4 h-4" />
                          <span>Hide</span>
                        </>
                      ) : (
                        <>
                          <EyeIcon className="w-4 h-4" />
                          <span>Show</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {error ? (
                  <div
                    role="alert"
                    className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
                  >
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full rounded-2xl bg-gradient-to-r from-[#FF5E62] via-[#FF8C42] to-[#D946EF] px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#FF5E62]/20 transition-all hover:opacity-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? 'Signing in…' : 'Sign in'}
                </button>

                <div className="relative my-4 flex items-center justify-center">
                  <div className="w-full border-t border-white/10" />
                  <span className="absolute bg-[#11131A] px-2 text-xs uppercase tracking-wider text-zinc-500">
                    or
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleQuantSSO}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-zinc-200 transition-all hover:bg-white/10 hover:text-white active:scale-[0.99]"
                >
                  <LightningIcon className="w-4 h-4 text-[#FF8C42]" />
                  <span>Continue with Quant SSO</span>
                </button>
              </form>

              {/* Registration Link */}
              <p className="mt-6 text-center text-sm text-zinc-400">
                New to the ecosystem?{' '}
                <a
                  href="https://quantmail.in/register"
                  className="font-semibold text-[#FF8C42] hover:text-[#FFA066] underline-offset-4 hover:underline transition-colors"
                >
                  Create a QuantID
                </a>
              </p>
            </div>
          </section>
        </main>

        {/* High-Fashion Bottom Navigation Links */}
        <footer className="w-full max-w-6xl mx-auto pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-400">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="flex items-center gap-1.5 hover:text-white transition-colors"
            >
              <GridIcon className="w-4 h-4 text-zinc-400" />
              <span>Explore Grid</span>
            </Link>
            <Link
              href="/reels"
              className="flex items-center gap-1.5 hover:text-white transition-colors"
            >
              <VideoIcon className="w-4 h-4 text-zinc-400" />
              <span>Watch Reels</span>
            </Link>
            <a
              href="https://quantmail.in/terms"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 hover:text-white transition-colors"
            >
              <LegalIcon className="w-4 h-4 text-zinc-400" />
              <span>Terms &amp; Privacy</span>
            </a>
          </div>

          <div className="text-zinc-500">
            &copy; {new Date().getFullYear()} QuantGram Creator Media. Sovereign Content Protocol.
          </div>
        </footer>
      </div>
    </>
  );
}
