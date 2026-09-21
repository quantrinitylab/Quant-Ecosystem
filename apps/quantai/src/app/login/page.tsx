'use client';

// ============================================================================
// QuantAI - Authentication Surface & Login Page
// Matches @quant/brand styling with QuantMail SSO & Email/Password login
// ============================================================================

import React, { useState, useCallback, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { spring, quantai } from '@quant/brand';
import { setAuthToken, setGuestMode, getAuthToken, getAuthUser } from '../../lib/auth';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const returnTo = searchParams?.get('returnTo') || '/';

  // If already authenticated, redirect to returnTo
  useEffect(() => {
    const existingToken = getAuthToken();
    if (existingToken) {
      router.replace(returnTo);
    }
  }, [router, returnTo]);

  // Handle 1-Click QuantMail SSO login
  const handleQuantMailSSO = useCallback(() => {
    setError(null);
    try {
      const stored =
        localStorage.getItem('token') ||
        localStorage.getItem('quant_token') ||
        localStorage.getItem('quantchat_access_token');
      if (stored) {
        const user = getAuthUser() || {
          id: `usr_${Date.now().toString(36)}`,
          email: 'user@quantmail.in',
          name: 'Quant Member',
          plan: 'pro',
        };
        setAuthToken(stored, user);
        router.replace(returnTo);
        return;
      }
    } catch {}

    const targetReturn = encodeURIComponent(
      typeof window !== 'undefined' ? `${window.location.origin}${returnTo}` : returnTo,
    );
    window.location.href = `https://quantmail.in/login?returnTo=${targetReturn}`;
  }, [router, returnTo]);

  // Handle guest exploration without logging in
  const handleContinueAsGuest = useCallback(() => {
    setGuestMode(true);
    router.replace(returnTo);
  }, [router, returnTo]);

  // Handle credential form submission
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Please enter your email address');
      return;
    }
    if (!trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
      setError('Please enter a valid email address');
      return;
    }
    if (!password) {
      setError('Please enter your password');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, password }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(
          data.error?.message || 'Authentication failed. Please check your credentials.',
        );
      }

      const token = data.data?.token || data.data?.accessToken;
      const user = data.data?.user || {
        id: `usr_${Date.now().toString(36)}`,
        email: trimmedEmail,
        name: trimmedEmail.split('@')[0],
        plan: 'pro' as const,
      };

      if (!token) {
        throw new Error('No authentication token received');
      }

      // Persist in memory session and localStorage
      setAuthToken(token, user);
      router.replace(returnTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-12 bg-[#0a0a0f] text-[var(--quant-foreground,#f8fafc)] relative overflow-hidden selection:bg-[#8B5CF6] selection:text-white">
      {/* Ambient background glow matching @quant/brand purple accent */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-[#8B5CF6]/15 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-10 right-1/4 w-[350px] h-[350px] bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -z-10" />

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', ...spring.gentle }}
        className="w-full max-w-md"
      >
        {/* Header Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-[#8B5CF6] to-indigo-600 shadow-lg shadow-[#8B5CF6]/25 mb-4 border border-[#8B5CF6]/30">
            {/* Brain circuit icon from @quant/brand */}
            <svg
              className="w-8 h-8 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" stroke="#ffffff" />
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="#ffffff" />
              <path
                d="M5.636 5.636l2.828 2.828M15.536 15.536l2.828 2.828M5.636 18.364l2.828-2.828M15.536 8.464l2.828-2.828"
                stroke="#ffffff"
              />
            </svg>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            <span>Welcome to</span>
            <span className="bg-gradient-to-r from-violet-400 via-purple-300 to-indigo-400 bg-clip-text text-transparent">
              {quantai.name}
            </span>
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-zinc-400">{quantai.description}</p>

          {/* Feature Highlights Pills */}
          <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
            <span className="px-2.5 py-0.5 text-[11px] font-medium rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/20">
              🧠 Persistent Memory
            </span>
            <span className="px-2.5 py-0.5 text-[11px] font-medium rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
              ⚡ Autonomous Swarm
            </span>
            <span className="px-2.5 py-0.5 text-[11px] font-medium rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
              🔒 Unified SSO
            </span>
          </div>
        </div>

        {/* Auth Card */}
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              role="alert"
              className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs sm:text-sm text-red-400 flex items-start gap-2.5"
            >
              <span className="text-red-400 font-bold">⚠️</span>
              <div className="flex-1">{error}</div>
            </motion.div>
          )}

          {/* 1-Click SSO Button */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleQuantMailSSO}
              className="w-full flex items-center justify-center gap-3 rounded-xl border border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700/80 py-3 px-4 font-semibold text-white shadow-sm transition-all duration-200 cursor-pointer group hover:border-violet-500/50"
            >
              <span className="flex items-center justify-center w-5 h-5 rounded-md bg-blue-500 text-white font-bold text-xs shadow-inner">
                ✉
              </span>
              <span className="text-sm font-medium">Continue with QuantMail SSO</span>
              <span className="text-xs text-zinc-400 group-hover:translate-x-0.5 transition-transform">
                →
              </span>
            </button>

            <div className="relative flex items-center justify-center py-2">
              <div className="border-t border-zinc-800 w-full" />
              <span className="bg-zinc-900 px-3 text-[11px] uppercase tracking-wider text-zinc-500 font-medium">
                Or sign in with email
              </span>
              <div className="border-t border-zinc-800 w-full" />
            </div>
          </div>

          {/* Email / Password Form */}
          <form onSubmit={handleSubmit} noValidate className="space-y-4 mt-2">
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-medium text-zinc-300 mb-1.5"
              >
                Email Address
              </label>
              <div className="relative">
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="name@quantmail.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950/60 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-all focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/20"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-password" className="block text-xs font-medium text-zinc-300">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative flex items-center">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950/60 px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-all focus:border-[#8B5CF6] focus:ring-2 focus:ring-[#8B5CF6]/20 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer select-none"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-[#8B5CF6] focus:ring-[#8B5CF6]/40 cursor-pointer accent-[#8B5CF6]"
                />
                <span className="text-xs text-zinc-400">Remember me</span>
              </label>

              <span className="text-xs text-zinc-500">256-bit Encrypted</span>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#8B5CF6] to-indigo-600 hover:from-violet-500 hover:to-indigo-500 py-3 px-4 font-semibold text-white shadow-md shadow-[#8B5CF6]/20 transition-all duration-200 cursor-pointer active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-sm mt-2"
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Signing in to QuantAI…
                </>
              ) : (
                'Sign In to QuantAI'
              )}
            </button>
          </form>

          {/* Guest Exploration Option */}
          <div className="mt-6 pt-5 border-t border-zinc-800/80 text-center">
            <p className="text-xs text-zinc-400 mb-2">Want to try out models and features first?</p>
            <button
              type="button"
              onClick={handleContinueAsGuest}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer py-1 px-3 rounded-lg hover:bg-emerald-500/10 border border-emerald-500/20"
            >
              <span>Explore as Guest</span>
              <span>→</span>
            </button>
          </div>
        </div>

        {/* Footer info */}
        <p className="mt-8 text-center text-xs text-zinc-500">
          Powered by Quant Swarm Intelligence • Autonomous Workspace
        </p>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] text-zinc-400 text-sm">
          Loading QuantAI Authentication…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
