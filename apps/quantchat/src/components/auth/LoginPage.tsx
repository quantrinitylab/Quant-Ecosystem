'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UniversalSSOTokenBridge } from '@quant/shared-ui';
import { apiClient } from '../../services/api-client';
import { persistSession } from '../../lib/auth-session';
import { useMsg91Widget } from '../../hooks/useMsg91Widget';

export type AuthMode = 'password' | 'phone';
export type Step = 'phone' | 'otp';

const COUNTRY_CODE_RE = /^\+\d{1,4}$/;

export const COUNTRIES = [
  { code: '+91', label: 'India', flag: '🇮🇳' },
  { code: '+1', label: 'United States', flag: '🇺🇸' },
  { code: '+44', label: 'United Kingdom', flag: '🇬🇧' },
  { code: '+971', label: 'United Arab Emirates', flag: '🇦🇪' },
  { code: '+65', label: 'Singapore', flag: '🇸🇬' },
  { code: '+49', label: 'Germany', flag: '🇩🇪' },
  { code: '+33', label: 'France', flag: '🇫🇷' },
];

export interface LoginPageProps {
  params?: Promise<Record<string, string | string[] | undefined>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  initialStep?: Step;
  initialAuthMode?: AuthMode;
  initialCountryCode?: string;
  initialPhoneNumber?: string;
  initialOtp?: string;
  initialDemoCode?: string | null;
}

export default function LoginPage(props: LoginPageProps) {
  const {
    initialStep = 'phone',
    initialAuthMode = 'phone',
    initialCountryCode = '+91',
    initialPhoneNumber = '',
    initialOtp = '',
    initialDemoCode = null,
  } = props ?? {};

  const router = useRouter();
  const [authMode, setAuthMode] = useState<AuthMode>(initialAuthMode);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<Step>(initialStep);
  const [countryCode, setCountryCode] = useState(initialCountryCode);
  const [phoneNumber, setPhoneNumber] = useState(initialPhoneNumber);
  const [otp, setOtp] = useState(initialOtp);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [countdown, setCountdown] = useState(30);
  const [demoCodeReceived, setDemoCodeReceived] = useState<string | null>(initialDemoCode);

  // MSG91 OTP Widget for real SMS delivery (client-side)
  const msg91 = useMsg91Widget();

  // Timer for resend
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (step === 'otp' && countdown > 0) {
      timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [step, countdown]);

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
    window.location.href = `https://quantmail.in/sso?returnTo=${returnTo}&client_id=quantchat`;
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

  const requestCode = useCallback(async () => {
    setError(null);
    setInfo(null);
    if (!COUNTRY_CODE_RE.test(countryCode)) {
      setError('Enter a valid country code, e.g. +1');
      return;
    }
    if (phoneNumber.replace(/\D/g, '').length < 4) {
      setError('Enter a valid phone number');
      return;
    }
    setBusy(true);
    try {
      // Use MSG91 widget for real SMS (client-side)
      // Falls back to backend API if widget not ready
      const fullPhone = `${countryCode.replace('+', '')}${phoneNumber.replace(/\D/g, '')}`;
      
      if (msg91.isReady) {
        try {
          await msg91.sendOtp(fullPhone);
          setStep('otp');
          setCountdown(30);
          setDemoCodeReceived(null);
          setInfo('Verification code sent via SMS');
          return;
        } catch (widgetErr) {
          // Fall through to backend API
        }
      }
      
      // Fallback: backend API
      const res = await apiClient.requestOTP({ phoneNumber, countryCode });
      if (!res.success) {
        setError(res.error?.message ?? 'Could not send a verification code');
        return;
      }
      setStep('otp');
      setCountdown(30); // reset countdown
      const demoCode = (res.data as { demoCode?: string })?.demoCode;
      if (demoCode) {
        setDemoCodeReceived(demoCode);
      } else {
        setDemoCodeReceived('123456');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [countryCode, phoneNumber, msg91]);

  const verifyCode = useCallback(async () => {
    setError(null);
    if (!/^\d{4,8}$/.test(otp)) {
      setError('Enter the numeric code you received');
      return;
    }
    setBusy(true);
    try {
      const full = `${countryCode}${phoneNumber.replace(/\D/g, '')}`;
      
      // Try MSG91 widget verification first (if widget was used to send)
      if (msg91.isReady) {
        try {
          const accessToken = await msg91.verifyOtp(otp);
          // Send JWT to backend for verification and session creation
          const res = await apiClient.verifyOTP({ 
            phoneNumber: full, 
            otp: `msg91:${accessToken}`, 
            deviceId: '' 
          });
          if (res.success && res.data) {
            persistSession(res.data.accessToken, res.data.refreshToken);
            router.replace('/');
            return;
          }
          // If backend rejects, fall through to normal flow
        } catch (widgetErr) {
          setError(widgetErr instanceof Error ? widgetErr.message : 'Invalid or expired code');
          return;
        }
      }
      
      // Fallback: backend OTP verification
      const res = await apiClient.verifyOTP({ phoneNumber: full, otp, deviceId: '' });
      if (!res.success || !res.data) {
        setError(res.error?.message ?? 'Invalid or expired code');
        return;
      }
      persistSession(res.data.accessToken, res.data.refreshToken);
      router.replace('/');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [countryCode, phoneNumber, otp, router, msg91]);

  const activeCountry = COUNTRIES.find((c) => c.code === countryCode);

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
              {authMode === 'password'
                ? 'Sign in with your QuantMail credentials.'
                : step === 'phone'
                  ? 'Enter your phone number to get a verification code.'
                  : `We sent a code to ${countryCode} ${phoneNumber || 'your phone'}`}
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

        {/* Tab Selector */}
        <div className="flex rounded-xl bg-white/[0.02] p-1 border border-white/5 mb-8">
          <button
            type="button"
            data-testid="tab-phone-otp"
            onClick={() => {
              setAuthMode('phone');
              setError(null);
            }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer ${
              authMode === 'phone'
                ? 'bg-white/10 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            📱 Phone OTP
          </button>
          <button
            type="button"
            data-testid="tab-quant-sso"
            onClick={() => {
              setAuthMode('password');
              setError(null);
            }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer ${
              authMode === 'password'
                ? 'bg-white/10 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            ⚡ Continue with Quant Account
          </button>
        </div>

        {authMode === 'password' ? (
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
              className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-3 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 shadow-lg shadow-emerald-500/20 cursor-pointer"
              data-testid="submit-password-btn"
            >
              {busy ? 'Signing in…' : 'Sign in to QuantChat'}
            </button>
            <div className="pt-4 border-t border-white/5">
              <button
                type="button"
                data-testid="quantmail-sso-btn"
                onClick={handleQuantSSO}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 py-3 text-sm font-medium text-white transition-colors cursor-pointer"
              >
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
            </div>
          </form>
        ) : step === 'phone' ? (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              void requestCode();
            }}
          >
            <div className="flex gap-3">
              <div className="relative group w-28">
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                  aria-label="Country code"
                  data-testid="country-code-select"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.label} ({c.code})
                    </option>
                  ))}
                </select>
                <div className="flex items-center justify-between h-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3 text-white focus-within:border-emerald-500/50 focus-within:bg-white/[0.05] transition-all">
                  <span className="text-lg leading-none" data-testid="selected-flag">
                    {activeCountry?.flag ?? '🇮🇳'}
                  </span>
                  <span className="text-sm font-medium" data-testid="selected-code">
                    {countryCode}
                  </span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-slate-400"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
              </div>
              <div className="flex-1">
                <label htmlFor="phone" className="sr-only">
                  Phone number
                </label>
                <input
                  id="phone"
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="Phone number"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full h-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-emerald-500/50 focus:bg-white/[0.05] transition-all"
                  data-testid="phone-input"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy || !phoneNumber}
              className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-3 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 shadow-lg shadow-emerald-500/20 mt-2 cursor-pointer"
              data-testid="submit-phone-btn"
            >
              {busy ? 'Sending…' : 'Send Verification Code →'}
            </button>

            <div className="pt-4 border-t border-white/5">
              <button
                type="button"
                data-testid="phone-view-sso-btn"
                onClick={handleQuantSSO}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 py-2.5 text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <span>Or continue with Quant Account</span>
                <svg
                  width="14"
                  height="14"
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
            </div>
          </form>
        ) : (
          <form
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              void verifyCode();
            }}
          >
            {/* Auto-Fill Demo OTP banner — DEVELOPMENT ONLY, never in production */}
            {process.env.NODE_ENV === 'development' && (
            <div
              className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3.5 flex flex-col items-center gap-2"
              data-testid="demo-otp-banner"
            >
              <button
                type="button"
                data-testid="auto-fill-otp-btn"
                onClick={() => setOtp(demoCodeReceived || '123456')}
                className="flex items-center gap-2 text-xs font-semibold bg-violet-500/20 hover:bg-violet-500/30 text-violet-200 px-4 py-2 rounded-full transition-colors border border-violet-500/30 cursor-pointer"
              >
                ✨ Auto-Fill Demo OTP:{' '}
                <span className="font-bold text-white">{demoCodeReceived || '123456'}</span>
              </button>
              <span className="text-[11px] text-slate-400">
                Development sandbox mode — no SMS gateway required
              </span>
            </div>
            )}

            <div className="space-y-3">
              <label htmlFor="otp" className="block text-xs font-medium text-slate-400 text-center">
                Enter 6-digit verification code
              </label>

              {/* 6-box input pin code view */}
              <div className="flex justify-between gap-2" data-testid="otp-boxes-container">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    data-testid={`otp-box-${i}`}
                    className={`w-12 h-14 rounded-xl border flex items-center justify-center text-2xl font-bold font-mono transition-all ${
                      otp[i]
                        ? 'border-emerald-500/70 bg-emerald-500/10 text-white shadow-sm shadow-emerald-500/20'
                        : i === otp.length
                          ? 'border-white/40 bg-white/[0.05] text-white ring-2 ring-emerald-500/30'
                          : 'border-white/10 bg-white/[0.02] text-slate-500'
                    }`}
                  >
                    {otp[i] || ''}
                  </div>
                ))}
              </div>

              <input
                id="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-center text-xl font-mono tracking-[0.5em] text-white focus:outline-none focus:border-emerald-500/50 focus:bg-white/[0.05] transition-all"
                data-testid="otp-input"
              />
            </div>

            <button
              type="submit"
              disabled={busy || otp.length < 4}
              className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-3 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 shadow-lg shadow-emerald-500/20 cursor-pointer"
              data-testid="verify-otp-btn"
            >
              {busy ? 'Verifying…' : 'Verify & Enter QuantChat'}
            </button>

            <div className="flex items-center justify-between text-sm px-1 pt-2">
              <button
                type="button"
                data-testid="change-number-btn"
                onClick={() => {
                  setStep('phone');
                  setOtp('');
                  setError(null);
                  setDemoCodeReceived(null);
                }}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                Change number
              </button>

              <button
                type="button"
                data-testid="resend-code-btn"
                onClick={() => {
                  if (countdown === 0) void requestCode();
                }}
                disabled={countdown > 0}
                className={`transition-colors ${countdown > 0 ? 'text-slate-500 cursor-not-allowed' : 'text-emerald-400 hover:text-emerald-300 cursor-pointer'}`}
              >
                {countdown > 0 ? `Resend code in ${countdown}s` : 'Resend code'}
              </button>
            </div>
          </form>
        )}
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
