'use client';

// ============================================================================
// QuantChat - Phone OTP sign-in
// ============================================================================
//
// Two-step phone sign-in against the REAL backend OTP endpoints (proxied via
// /api/auth/otp/*). On successful verification the issued JWTs are persisted
// (localStorage + apiClient) so the shared useAuth hook resolves the verified
// identity and every authed data request carries the bearer. No fabricated
// session is ever created: a failed request surfaces the backend error.

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../services/api-client';
import { persistSession } from '../../lib/auth-session';

type Step = 'phone' | 'otp';

const COUNTRY_CODE_RE = /^\+\d{1,4}$/;

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('phone');
  const [countryCode, setCountryCode] = useState('+1');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

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
      setInfo('We sent a verification code to your phone.');
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
      // apiClient.verifyOTP injects its own generated deviceId, overriding this
      // placeholder — it is only present to satisfy the OTPVerifyRequest type.
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
    <main className="min-h-screen flex items-center justify-center bg-[var(--quant-background)] px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-indigo-500 flex items-center justify-center text-white text-2xl font-bold">
            Q
          </div>
          <h1 className="text-2xl font-bold text-[var(--quant-foreground)]">
            Sign in to QuantChat
          </h1>
          <p className="text-sm text-[var(--quant-muted-foreground)]">
            {step === 'phone'
              ? 'Enter your phone number to get a verification code.'
              : `Enter the code sent to ${countryCode} ${phoneNumber}.`}
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500"
          >
            {error}
          </div>
        )}
        {info && !error && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">
            {info}
          </div>
        )}

        {step === 'phone' ? (
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
                  className="w-full rounded-lg border border-[var(--quant-border)] bg-[var(--quant-background)] px-3 py-2 text-[var(--quant-foreground)]"
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
                  className="w-full rounded-lg border border-[var(--quant-border)] bg-[var(--quant-background)] px-3 py-2 text-[var(--quant-foreground)]"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-emerald-500 py-2.5 font-semibold text-white transition-opacity disabled:opacity-60"
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
                className="w-full rounded-lg border border-[var(--quant-border)] bg-[var(--quant-background)] px-3 py-2 text-center text-lg tracking-[0.4em] text-[var(--quant-foreground)]"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-emerald-500 py-2.5 font-semibold text-white transition-opacity disabled:opacity-60"
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
              className="w-full py-2 text-sm text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]"
            >
              Use a different number
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
