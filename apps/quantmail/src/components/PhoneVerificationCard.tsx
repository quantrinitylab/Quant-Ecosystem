'use client';

// ============================================================================
// Phone number + SMS OTP verification card (AWS SNS delivery on the backend).
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { Button, Input, FormField } from '@quant/shared-ui';
import { browserApiRequest as apiRequest } from '../services/browser-api-request';

interface PhoneState {
  phoneNumber: string | null;
  maskedPhoneNumber: string | null;
  phoneVerified: boolean;
  smsReady: boolean;
}

/**
 * The session lives in an `authorization` header, not in a cookie, so a bare
 * `fetch(..., { credentials: 'include' })` sent nothing the API recognised: the
 * live site answered 401 to `GET /api/auth/phone` on every settings visit, the
 * `catch` below blanked the state, and the card rendered as if no phone had ever
 * been added. `browserApiRequest` is the app's own authenticated fetch — it
 * attaches the token and refreshes it.
 */
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiRequest(path, init);
  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    data?: T;
    error?: { message?: string };
  };
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error?.message ?? 'Request failed');
  }
  return payload.data as T;
}

export function PhoneVerificationCard() {
  const [state, setState] = useState<PhoneState | null>(null);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'idle' | 'code-sent'>('idle');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await call<PhoneState>('/api/auth/phone');
      setState(data);
      if (data.phoneNumber && !data.phoneVerified) setPhone(data.phoneNumber);
    } catch {
      setState(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sendOtp = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      await call('/api/auth/phone/send-otp', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: phone.trim() }),
      });
      setStep('code-sent');
      setMessage({ kind: 'ok', text: 'We sent a 6-digit code by SMS. It expires in 5 minutes.' });
    } catch (error) {
      setMessage({ kind: 'error', text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }, [phone]);

  const verify = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      await call('/api/auth/phone/verify', {
        method: 'POST',
        body: JSON.stringify({ code: code.trim() }),
      });
      setCode('');
      setStep('idle');
      setMessage({ kind: 'ok', text: 'Mobile number verified.' });
      await load();
    } catch (error) {
      setMessage({ kind: 'error', text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }, [code, load]);

  const unlink = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      await call('/api/auth/phone', { method: 'DELETE' });
      setPhone('');
      setStep('idle');
      await load();
    } catch (error) {
      setMessage({ kind: 'error', text: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }, [load]);

  return (
    <section aria-labelledby="phone-verification-heading">
      <h2
        id="phone-verification-heading"
        className="mb-1 text-base font-semibold text-[var(--quant-foreground)]"
      >
        Mobile number
      </h2>
      <p className="mb-4 text-sm text-[var(--quant-muted-foreground)]">
        Add a mobile number and verify it with a real SMS code for account recovery and security
        alerts.
      </p>

      <div className="max-w-xl space-y-4 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-4">
        {state?.phoneVerified ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[var(--quant-foreground)]">
                {state.maskedPhoneNumber}
              </p>
              <p className="text-xs text-[var(--quant-muted-foreground)]">Verified by SMS</p>
            </div>
            <Button variant="secondary" onClick={() => void unlink()} disabled={busy}>
              Remove number
            </Button>
          </div>
        ) : (
          <>
            <FormField label="Mobile number (international format)">
              <Input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+919812345678"
                inputMode="tel"
              />
            </FormField>

            {step === 'code-sent' && (
              <FormField label="Verification code">
                <Input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="6-digit code"
                  inputMode="numeric"
                />
              </FormField>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={step === 'code-sent' ? 'secondary' : 'primary'}
                onClick={() => void sendOtp()}
                disabled={busy || phone.trim().length < 8}
              >
                {step === 'code-sent' ? 'Resend code' : 'Send code'}
              </Button>
              {step === 'code-sent' && (
                <Button
                  variant="primary"
                  onClick={() => void verify()}
                  disabled={busy || code.trim().length < 4}
                >
                  Verify number
                </Button>
              )}
            </div>
          </>
        )}

        {state && !state.smsReady && (
          <p className="text-xs text-[var(--quant-muted-foreground)]">
            SMS delivery is not enabled on this environment yet, so codes cannot be sent right now.
          </p>
        )}
        {message && (
          <p
            className={`text-xs ${
              message.kind === 'error'
                ? 'text-[var(--quant-destructive)]'
                : 'text-[var(--quant-muted-foreground)]'
            }`}
          >
            {message.text}
          </p>
        )}
      </div>
    </section>
  );
}
