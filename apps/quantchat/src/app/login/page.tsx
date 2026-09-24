'use client';

// ============================================================================
// QuantChat - Dual Sign-In (Email/Password & Phone OTP)
// ============================================================================
//
// Dual sign-in against the REAL backend endpoints (proxied via /api/auth/*).
// Supports instant QuantMail account (Email & Password) login and SMS OTP.
// On successful verification the issued JWTs are persisted (localStorage + apiClient).

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../services/api-client';
import { persistSession } from '../../lib/auth-session';

type AuthMode = 'password' | 'phone';
type Step = 'phone' | 'otp';

const COUNTRY_CODE_RE = /^\+\d{1,4}$/;

export default function LoginPage() {
  const router = useRouter();
  const [authMode, setAuthMode] = useState<AuthMode>('password');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<Step>('phone');
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Auto-capture SSO tokens returned from QuantMail Account Chooser
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') || params.get('accessToken') || params.get('access_token');
    const refreshToken = params.get('refreshToken') || params.get('refresh_token') || token || '';
    if (token) {
      persistSession(token, refreshToken);
      router.replace('/');
    }
  }, [router]);

  const handleQuantSSO = useCallback(() => {
    try {
      const stored =
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
      const res = await apiClient.requestOTP({ phoneNumber, countryCode });
      if (!res.success) {
        setError(res.error?.message ?? 'Could not send a verification code');
        return;
      }
      setStep('otp');
      const demoCode = (res.data as { demoCode?: string })?.demoCode;
      if (demoCode) {
        setInfo(`Verification code sent! (Code: ${demoCode})`);
        setOtp(demoCode);
      } else {
        setInfo('We sent a verification code to your phone.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [countryCode, phoneNumber]);

  const verifyCode = useCallback(async () => {
    setError(null);
    if (!/^\d{4,8}$/.test(otp)) {
      setError('Enter the numeric code you received');
      return;
    }
    setBusy(true);
    try {
      const full = `${countryCode}${phoneNumber.replace(/\D/g, '')}`;
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
  }, [countryCode, phoneNumber, otp, router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--quant-background,#09090b)] px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-indigo-500 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-emerald-500/20">
            Q
          </div>
          <h1 className="text-2xl font-bold text-[var(--quant-foreground,#fafafa)]">
            Sign in to QuantChat
          </h1>
          <p className="text-sm text-[var(--quant-muted-foreground,#a1a1aa)]">
            {authMode === 'password'
              ? 'Sign in with your QuantMail or ecosystem credentials.'
              : step === 'phone'
                ? 'Enter your phone number to get a verification code.'
                : `Enter the code sent to ${countryCode} ${phoneNumber}.`}
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400"
          >
            {error}
          </div>
        )}
        {info && !error && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
            {info}
          </div>
        )}

        {/* Tab Selector */}
        <div className="flex rounded-lg bg-[var(--quant-muted,#27272a)] p-1 border border-[var(--quant-border,#3f3f46)]">
          <button
            type="button"
            onClick={() => {
              setAuthMode('password');
              setError(null);
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
              authMode === 'password'
                ? 'bg-[var(--quant-background,#09090b)] text-white shadow'
                : 'text-[var(--quant-muted-foreground,#a1a1aa)] hover:text-white'
            }`}
          >
            ⚡ Quant Account
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMode('phone');
              setError(null);
            }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
              authMode === 'phone'
                ? 'bg-[var(--quant-background,#09090b)] text-white shadow'
                : 'text-[var(--quant-muted-foreground,#a1a1aa)] hover:text-white'
            }`}
          >
            📱 Phone OTP
          </button>
        </div>

        {authMode === 'password' ? (
          <form className="space-y-4" onSubmit={handlePasswordLogin}>
            <div>
              <label
                htmlFor="identifier"
                className="block text-xs font-medium text-[var(--quant-muted-foreground,#a1a1aa)] mb-1"
              >
                Email or Username
              </label>
              <input
                id="identifier"
                type="text"
                autoComplete="username"
                placeholder="user@quantmail.in or username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full rounded-lg border border-[var(--quant-border,#3f3f46)] bg-[var(--quant-surface,#18181b)] px-3 py-2 text-sm text-[var(--quant-foreground,#fafafa)] placeholder-[var(--quant-muted-foreground,#71717a)] focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium text-[var(--quant-muted-foreground,#a1a1aa)] mb-1"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-[var(--quant-border,#3f3f46)] bg-[var(--quant-surface,#18181b)] px-3 py-2 text-sm text-[var(--quant-foreground,#fafafa)] placeholder-[var(--quant-muted-foreground,#71717a)] focus:outline-none focus:border-emerald-500"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-emerald-500 py-2.5 font-semibold text-white transition-opacity hover:bg-emerald-600 disabled:opacity-60 shadow-md shadow-emerald-500/20"
            >
              {busy ? 'Signing in…' : 'Sign in to QuantChat'}
            </button>
            <div className="pt-2">
              <button
                type="button"
                onClick={handleQuantSSO}
                className="w-full text-center text-xs text-[var(--quant-muted-foreground,#a1a1aa)] hover:text-emerald-400 transition-colors"
              >
                Sign in with QuantMail SSO →
              </button>
            </div>
          </form>
        ) : step === 'phone' ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void requestCode();
            }}
          >
            <div className="flex gap-2">
              <div className="w-20">
                <label htmlFor="cc" className="sr-only">
                  Country code
                </label>
                <input
                  id="cc"
                  inputMode="tel"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value.trim())}
                  className="w-full rounded-lg border border-[var(--quant-border,#3f3f46)] bg-[var(--quant-surface,#18181b)] px-3 py-2 text-sm text-[var(--quant-foreground,#fafafa)]"
                  aria-label="Country code"
                />
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
                  className="w-full rounded-lg border border-[var(--quant-border,#3f3f46)] bg-[var(--quant-surface,#18181b)] px-3 py-2 text-sm text-[var(--quant-foreground,#fafafa)] placeholder-[var(--quant-muted-foreground,#71717a)]"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-emerald-500 py-2.5 font-semibold text-white transition-opacity hover:bg-emerald-600 disabled:opacity-60 shadow-md shadow-emerald-500/20"
            >
              {busy ? 'Sending…' : 'Send code'}
            </button>
          </form>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void verifyCode();
            }}
          >
            <div>
              <label htmlFor="otp" className="sr-only">
                Verification code
              </label>
              <input
                id="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Verification code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                className="w-full rounded-lg border border-[var(--quant-border,#3f3f46)] bg-[var(--quant-surface,#18181b)] px-3 py-2 text-center text-lg tracking-[0.4em] text-[var(--quant-foreground,#fafafa)]"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-emerald-500 py-2.5 font-semibold text-white transition-opacity hover:bg-emerald-600 disabled:opacity-60 shadow-md shadow-emerald-500/20"
            >
              {busy ? 'Verifying…' : 'Verify & continue'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('phone');
                setOtp('');
                setError(null);
                setInfo(null);
              }}
              className="w-full py-2 text-sm text-[var(--quant-muted-foreground,#a1a1aa)] hover:text-[var(--quant-foreground,#fafafa)]"
            >
              Use a different number
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
