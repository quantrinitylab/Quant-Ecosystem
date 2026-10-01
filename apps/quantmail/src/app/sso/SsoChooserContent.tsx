'use client';

// ============================================================================
// QuantMail Universal SSO - Google-Class Account Chooser
// ============================================================================
//
// Provides the 1-click Google-like multi-account switcher and SSO identity handoff
// for all ecosystem applications (QuantChat, QuanTube, QuantMax, QuantAI, etc.).
//
// Behavior:
// 1. If an active session exists (or saved accounts in browser), renders the
//    Account Chooser with avatars, names, and "Signed in" indicators.
// 2. 1-click on active account immediately mints/transfers the session token and
//    redirects to `returnTo` with `?token=${accessToken}`.
// 3. Allows "Use another account" to sign into a separate Quant identity.
// 4. Secure: strictly validates `returnTo` against `safeReturnPath` allowlist
//    (quantmail.in, *.quantrinity.in, localhost).

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { QuantMailLogo } from '../../components/QuantMailLogo';
import { safeReturnPath } from '../../lib/safe-return-path';
import { useAuth } from '../../providers/auth-provider';
import { browserAuthSession } from '../../services/browser-auth-session';
import { toQuantAddress } from '../../config/identity';

interface StoredAccount {
  id: string;
  email: string;
  displayName: string;
  phoneVerified?: boolean;
}

const STORAGE_ACCOUNTS_KEY = 'quant_known_accounts';

function initials(name: string): string {
  const parts = name
    .replace(/@.*/, '')
    .split(/[.\s_-]+/)
    .filter(Boolean);
  const value = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  return (value || name[0] || 'Q').toUpperCase();
}

function gradientFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 48) % 360;
  return `linear-gradient(135deg, hsl(${a} 70% 55%), hsl(${b} 72% 48%))`;
}

function resolveClientApp(
  clientId: string | null,
  returnTo: string | null,
): { name: string; icon: string } {
  const query = `${clientId ?? ''} ${returnTo ?? ''}`.toLowerCase();
  if (query.includes('quantchat')) return { name: 'QuantChat', icon: '💬' };
  if (query.includes('quantube')) return { name: 'QuanTube', icon: '📺' };
  if (query.includes('quantmax')) return { name: 'QuantMax', icon: '⚡' };
  if (query.includes('quantai')) return { name: 'QuantAI', icon: '🧠' };
  if (query.includes('quantgram') || query.includes('quantneon'))
    return { name: 'QuantGram', icon: '📸' };
  if (query.includes('quantwave') || query.includes('quantsync'))
    return { name: 'QuantWave', icon: '🌊' };
  if (query.includes('quantcooks') || query.includes('quantedits'))
    return { name: 'QuantCooks', icon: '🎬' };
  if (query.includes('quantads')) return { name: 'QuantAds', icon: '📈' };
  if (query.includes('quantgit') || query.includes('codehub'))
    return { name: 'CodeHub', icon: '💻' };
  if (query.includes('quanttrinity')) return { name: 'QuantTrinity', icon: '👑' };
  return { name: 'Quant Ecosystem', icon: '⚡' };
}

export function SsoChooserContent({
  initialStage = 'credentials',
  initialKycOtpSent = false,
  initialKycDemoInfo = null,
}: {
  initialStage?: 'credentials' | 'two-factor' | 'phone-kyc';
  initialKycOtpSent?: boolean;
  initialKycDemoInfo?: { isDemo: boolean; demoCode?: string; message: string } | null;
} = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading, login, completeTwoFactor } = useAuth();

  const rawReturnTo = searchParams?.get('returnTo') ?? null;
  const clientId = searchParams?.get('client_id') ?? null;
  const safeReturn = useMemo(() => safeReturnPath(rawReturnTo) || '/', [rawReturnTo]);
  const clientApp = useMemo(() => resolveClientApp(clientId, rawReturnTo), [clientId, rawReturnTo]);

  const [knownAccounts, setKnownAccounts] = useState<StoredAccount[]>([]);
  const [isAddingAnother, setIsAddingAnother] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);

  // Manual login form state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<'credentials' | 'two-factor' | 'phone-kyc'>(initialStage);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Phone KYC State
  const [kycPhone, setKycPhone] = useState('');
  const [kycCountry, setKycCountry] = useState('+91');
  const [kycOtpSent, setKycOtpSent] = useState(initialKycOtpSent);
  const [kycOtpDemoInfo, setKycOtpDemoInfo] = useState<{
    isDemo: boolean;
    demoCode?: string;
    message: string;
  } | null>(initialKycDemoInfo);
  const [kycCode, setKycCode] = useState('');

  // Execute seamless token handoff to returnTo destination
  const handoffSession = useCallback(
    (token: string | null) => {
      setAuthorizing(true);
      if (!token) {
        setError('No active session token available. Please sign in again.');
        setAuthorizing(false);
        return;
      }

      if (safeReturn.startsWith('http://') || safeReturn.startsWith('https://')) {
        try {
          const targetUrl = new URL(safeReturn);
          targetUrl.searchParams.set('token', token);
          targetUrl.searchParams.set('accessToken', token);
          targetUrl.searchParams.set('refreshToken', token);
          targetUrl.searchParams.set('__quant_sso_ticket', token);
          if (user) {
            targetUrl.searchParams.set('userId', user.id);
            targetUrl.searchParams.set('email', user.email);
            if (user.displayName) targetUrl.searchParams.set('displayName', user.displayName);
          }
          window.location.href = targetUrl.toString();
          return;
        } catch {
          // fallback
        }
      }
      router.push(safeReturn);
    },
    [safeReturn, user, router],
  );

  // Hydrate known accounts from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_ACCOUNTS_KEY);
      const list: StoredAccount[] = raw ? JSON.parse(raw) : [];
      if (user) {
        const currentEmail = user.email.toLowerCase();
        const existingIdx = list.findIndex((a) => a.email.toLowerCase() === currentEmail);
        const current: StoredAccount = {
          id: user.id || currentEmail,
          email: user.email,
          displayName: user.displayName || user.username || user.email.split('@')[0],
          phoneVerified: user.phoneVerified,
        };
        if (existingIdx >= 0) {
          list[existingIdx] = current;
        } else {
          list.unshift(current);
        }
        localStorage.setItem(STORAGE_ACCOUNTS_KEY, JSON.stringify(list));
      }
      setKnownAccounts(list);
    } catch {
      /* ignore */
    }
  }, [user]);

  // Helper to check KYC before handoff
  const proceedWithSession = useCallback(
    async (token: string | null) => {
      setAuthorizing(true);
      if (!token) {
        setError('No active session token available. Please sign in again.');
        setAuthorizing(false);
        return;
      }
      try {
        const res = await fetch('/api/oauth/userinfo', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const profile = await res.json();
        if (profile.success && profile.data?.phoneVerified) {
          handoffSession(token);
        } else {
          setAuthorizing(false);
          setStage('phone-kyc');
        }
      } catch {
        setAuthorizing(false);
        handoffSession(token); // Fallback
      }
    },
    [handoffSession],
  );

  // 1-Click Select current active account
  const handleSelectActiveAccount = useCallback(() => {
    const token = browserAuthSession.getAccessToken();
    proceedWithSession(token);
  }, [proceedWithSession]);

  // Handle manual login submit
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!identifier.trim() || !password) {
      setError('Please enter your email and password');
      return;
    }
    setSubmitting(true);
    const trimmed = identifier.trim();
    const email = trimmed.includes('@') ? trimmed : toQuantAddress(trimmed);

    try {
      const outcome = await login(email, password);
      if (outcome.status === 'two-factor-required') {
        setStage('two-factor');
        setSubmitting(false);
        return;
      }
      // Success! Hand off token to caller
      const token = browserAuthSession.getAccessToken();
      proceedWithSession(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
      setSubmitting(false);
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) {
      setError('Please enter the verification code');
      return;
    }
    setSubmitting(true);
    try {
      await completeTwoFactor(code.trim());
      const token = browserAuthSession.getAccessToken();
      proceedWithSession(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid verification code');
      setSubmitting(false);
    }
  };

  const handleSendKycOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const token = browserAuthSession.getAccessToken();
      const res = await fetch('/api/auth/phone/send-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ phoneNumber: `${kycCountry}${kycPhone}` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || data.message || 'Failed to send OTP');
      setKycOtpSent(true);
      setKycOtpDemoInfo({
        isDemo: data.data?.isDemo,
        demoCode: data.data?.demoCode,
        message: data.data?.message || 'Verification code sent',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send SMS');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyKycOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const token = browserAuthSession.getAccessToken();
      const res = await fetch('/api/auth/phone/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: kycCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || data.message || 'Invalid OTP');

      // Success! Hand off session
      handoffSession(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setSubmitting(false);
    }
  };

  const allAccounts = useMemo(() => {
    const map = new Map<string, StoredAccount>();
    if (user) {
      map.set(user.email.toLowerCase(), {
        id: user.id || user.email,
        email: user.email,
        displayName: user.displayName || user.username || user.email.split('@')[0],
        phoneVerified: user.phoneVerified,
      });
    }
    for (const a of knownAccounts) {
      if (!map.has(a.email.toLowerCase())) {
        map.set(a.email.toLowerCase(), a);
      }
    }
    return Array.from(map.values());
  }, [user, knownAccounts]);

  const hasAccounts = allAccounts.length > 0;
  const showChooser = hasAccounts && !isAddingAnother;

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[var(--quant-background)] text-[#FAFAFA] px-4 py-8 selection:bg-[#FF8C42]/20 selection:text-[var(--brand-primary)]">
      {/* Central Google-Class SSO Card */}
      <div className="w-full max-w-md rounded-2xl bg-[#111318]/90 backdrop-blur-xl border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_20px_40px_-15px_rgba(0,0,0,0.7)] p-8 sm:p-10 flex flex-col items-center transition-all">
        {/* Brand Logo with Pupil Tracking */}
        <div className="mb-6 flex flex-col items-center">
          <div className="w-12 h-12 flex items-center justify-center">
            <QuantMailLogo size={48} />
          </div>
          <div className="mt-3 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06] text-[11px] font-medium tracking-wider uppercase text-zinc-400">
            <span>Quant ID</span>
            <span className="text-zinc-600">•</span>
            <span className="text-[var(--brand-primary)]">Single Sign-On</span>
          </div>
        </div>

        {/* Title & Subtitle */}
        {stage !== 'phone-kyc' && (
          <div className="text-center mb-6">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
              {showChooser ? 'Choose an account' : 'Sign in to Quant Account'}
            </h1>
            <p className="mt-1.5 text-sm text-zinc-400">
              to continue to{' '}
              <span className="font-medium text-white inline-flex items-center gap-1">
                <span>{clientApp.icon}</span>
                <span>{clientApp.name}</span>
              </span>
            </p>
          </div>
        )}

        {/* Authorizing Spinner Overlay */}
        {authorizing && (
          <div className="w-full py-12 flex flex-col items-center justify-center space-y-3">
            <div className="w-8 h-8 rounded-full border-2 border-[var(--brand-primary)] border-t-transparent animate-spin" />
            <p className="text-sm font-medium text-zinc-300">
              Connecting you to {clientApp.name}...
            </p>
          </div>
        )}

        {/* STATE 1: Google-Class Account Chooser */}
        {!authorizing && showChooser && (
          <div className="w-full space-y-3">
            <div className="divide-y divide-white/[0.06] border border-white/[0.08] rounded-xl overflow-hidden bg-white/[0.02]">
              {allAccounts.map((acc) => {
                const isActive = user && user.email.toLowerCase() === acc.email.toLowerCase();
                return (
                  <button
                    key={acc.email}
                    onClick={() => {
                      if (isActive) {
                        handleSelectActiveAccount();
                      } else {
                        setIdentifier(acc.email);
                        setIsAddingAnother(true);
                      }
                    }}
                    type="button"
                    className="w-full flex items-center gap-3.5 p-3.5 hover:bg-white/[0.05] active:bg-white/[0.08] transition-colors text-left group"
                  >
                    {/* Circle Avatar */}
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shadow-inner flex-shrink-0"
                      style={{ background: gradientFor(acc.email) }}
                    >
                      {initials(acc.displayName || acc.email)}
                    </div>

                    {/* Account Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white truncate group-hover:text-[var(--brand-primary)] transition-colors">
                        {acc.displayName || acc.email.split('@')[0]}
                      </div>
                      <div className="text-xs text-zinc-400 truncate">{acc.email}</div>
                      {acc.phoneVerified !== undefined && (
                        <div
                          className={`text-[10px] mt-0.5 ${acc.phoneVerified ? 'text-green-400' : 'text-yellow-400'}`}
                        >
                          {acc.phoneVerified
                            ? 'Phone Verified ✓'
                            : 'Phone Verification Required ⚠️'}
                        </div>
                      )}
                    </div>

                    {/* Status Badge */}
                    {isActive ? (
                      <span className="flex-shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Signed in
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-500 group-hover:text-zinc-300">→</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Use Another Account Button */}
            <button
              onClick={() => {
                setIdentifier('');
                setPassword('');
                setError(null);
                setIsAddingAnother(true);
              }}
              type="button"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-white/[0.08] hover:border-white/[0.16] hover:bg-white/[0.04] text-sm font-medium text-zinc-300 hover:text-white transition-all"
            >
              <span className="text-base leading-none font-bold text-[var(--brand-primary)]">
                +
              </span>
              <span>Use another account</span>
            </button>
          </div>
        )}

        {/* STATE 2: Integrated Sign-In Form */}
        {!authorizing && !showChooser && stage === 'credentials' && (
          <div className="w-full">
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Quant Address or Handle
                </label>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="you@quantmail.in"
                  autoFocus
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] focus:border-[var(--brand-primary)] focus:ring-1 focus:ring-[var(--brand-primary)] text-sm text-white placeholder:text-zinc-600 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] focus:border-[var(--brand-primary)] focus:ring-1 focus:ring-[var(--brand-primary)] text-sm text-white placeholder:text-zinc-600 outline-none transition-all pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-zinc-300"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-[var(--brand-primary)] text-[var(--quant-background)] font-semibold text-sm hover:brightness-110 active:scale-[0.99] transition-all shadow-[0_4px_16px_-4px_rgba(255,140,66,0.5)] disabled:opacity-50"
              >
                {submitting ? 'Signing in...' : `Continue to ${clientApp.name}`}
              </button>

              {hasAccounts && (
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingAnother(false);
                    setError(null);
                  }}
                  className="w-full text-center text-xs text-zinc-400 hover:text-zinc-200 mt-2 py-1 transition-colors"
                >
                  ← Back to account list
                </button>
              )}
            </form>
          </div>
        )}

        {!authorizing && !showChooser && stage === 'two-factor' && (
          <div className="w-full">
            <form onSubmit={handleCodeSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Two-Factor Authentication Code
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="6-digit code or recovery code"
                  autoFocus
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] focus:border-[var(--brand-primary)] focus:ring-1 focus:ring-[var(--brand-primary)] text-sm text-white placeholder:text-zinc-600 outline-none transition-all"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 rounded-xl bg-[var(--brand-primary)] text-[var(--quant-background)] font-semibold text-sm hover:brightness-110 active:scale-[0.99] transition-all shadow-[0_4px_16px_-4px_rgba(255,140,66,0.5)] disabled:opacity-50"
              >
                {submitting ? 'Verifying...' : `Verify and Continue`}
              </button>
            </form>
          </div>
        )}

        {/* STATE 3: Phone KYC */}
        {!authorizing && !showChooser && stage === 'phone-kyc' && (
          <div className="w-full">
            <div className="text-center mb-6">
              <h2 className="text-lg font-semibold text-white flex items-center justify-center gap-2">
                🛡️ Quant Identity KYC • Phone & Email Verification
              </h2>
              <span className="inline-block mt-2 px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] uppercase font-bold tracking-wider">
                Google KYC Parity
              </span>
              <p className="mt-3 text-sm text-zinc-400">
                To protect your sovereign account and access {clientApp.name}, please verify with a
                one-time code sent to your mobile and email.
              </p>
              {user?.email && (
                <p className="mt-2 text-xs text-zinc-500">
                  📧 Verification code will also be sent to your registered QuantMail address:{' '}
                  {user.email}
                </p>
              )}
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                {error}
              </div>
            )}

            {!kycOtpSent ? (
              <form onSubmit={handleSendKycOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                    Mobile Number
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={kycCountry}
                      onChange={(e) => setKycCountry(e.target.value)}
                      className="w-[100px] px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] focus:border-[var(--brand-primary)] focus:ring-1 focus:ring-[var(--brand-primary)] text-sm text-white outline-none appearance-none"
                    >
                      <option value="+91">🇮🇳 +91</option>
                      <option value="+1">🇺🇸 +1</option>
                      <option value="+44">🇬🇧 +44</option>
                      <option value="+971">🇦🇪 +971</option>
                      <option value="+65">🇸🇬 +65</option>
                      <option value="+49">🇩🇪 +49</option>
                      <option value="+33">🇫🇷 +33</option>
                    </select>
                    <input
                      type="tel"
                      value={kycPhone}
                      onChange={(e) => setKycPhone(e.target.value.replace(/\D/g, ''))}
                      placeholder="9876543210"
                      required
                      className="flex-1 px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] focus:border-[var(--brand-primary)] focus:ring-1 focus:ring-[var(--brand-primary)] text-sm text-white placeholder:text-zinc-600 outline-none transition-all"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={submitting || !kycPhone}
                  className="w-full mt-2 py-3 px-4 rounded-xl bg-[var(--brand-primary)] text-[var(--quant-background)] font-semibold text-sm hover:brightness-110 active:scale-[0.99] transition-all shadow-[0_4px_16px_-4px_rgba(255,140,66,0.5)] disabled:opacity-50"
                >
                  {submitting ? 'Sending...' : 'Send Verification Code'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyKycOtp} className="space-y-4">
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-xs text-green-400 text-center">
                  📩 Code sent to mobile and email {user?.email}. Check your email or use the demo
                  code below if SMS is delayed.
                </div>

                <div className="flex justify-center gap-2 mb-2">
                  <button
                    type="button"
                    onClick={handleSendKycOtp}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/[0.08] transition-colors"
                  >
                    📱 Resend SMS
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const token = browserAuthSession.getAccessToken();
                        await fetch('/api/auth/phone/send-email-otp', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`,
                          },
                          body: JSON.stringify({ phoneNumber: `${kycCountry}${kycPhone}` }),
                        });
                      } catch (e) {
                        // Ignore
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/[0.08] transition-colors"
                  >
                    📧 Send via Email
                  </button>
                </div>

                {kycOtpDemoInfo?.isDemo && kycOtpDemoInfo.demoCode && (
                  <div className="flex justify-center mb-2">
                    <button
                      type="button"
                      onClick={() => setKycCode(kycOtpDemoInfo.demoCode!)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-xs font-medium text-yellow-400 hover:bg-yellow-500/20 transition-colors"
                    >
                      ✨ Auto-Fill Demo OTP: {kycOtpDemoInfo.demoCode}
                    </button>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                    6-Digit Code
                  </label>
                  <input
                    type="text"
                    value={kycCode}
                    onChange={(e) => setKycCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    autoFocus
                    required
                    maxLength={6}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] focus:border-[var(--brand-primary)] focus:ring-1 focus:ring-[var(--brand-primary)] text-center tracking-[0.5em] text-lg text-white placeholder:text-zinc-600 outline-none transition-all"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting || kycCode.length < 4}
                  className="w-full mt-2 py-3 px-4 rounded-xl bg-[var(--brand-primary)] text-[var(--quant-background)] font-semibold text-sm hover:brightness-110 active:scale-[0.99] transition-all shadow-[0_4px_16px_-4px_rgba(255,140,66,0.5)] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? 'Verifying...' : 'Verify & Complete KYC ✓'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setKycOtpSent(false);
                    setKycCode('');
                    setError(null);
                  }}
                  className="w-full text-center text-xs text-zinc-400 hover:text-zinc-200 mt-2 py-1 transition-colors"
                >
                  Use a different number
                </button>
              </form>
            )}
          </div>
        )}

        {/* Ecosystem Privacy & Terms Notice */}
        <div className="mt-8 pt-6 border-t border-white/[0.06] text-center w-full">
          <p className="text-[11px] leading-relaxed text-zinc-500">
            To continue, Quant will securely share your profile with{' '}
            <span className="text-zinc-300 font-medium">{clientApp.name}</span>. Protected by Quant
            Zero-Trust Auth Architecture.
          </p>
        </div>
      </div>
    </div>
  );
}
