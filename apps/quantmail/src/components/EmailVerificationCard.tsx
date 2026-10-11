'use client';

// ============================================================================
// Email verification card (Settings → Security).
//
// Registration no longer hardcodes emailVerified: true. A real verification
// mail is dispatched at signup (and can be resent here) via SES; the link
// flips the flag through GET /auth/verify-email. This card states the actual
// state — verified, or not yet with a working resend — and never claims a
// mail went out when it did not (the backend answers 503 honestly when SES
// is unavailable).
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@quant/shared-ui';
import { browserApiRequest as apiRequest } from '../services/browser-api-request';

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

export function EmailVerificationCard() {
  const [verified, setVerified] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await call<{ email?: string; emailVerified?: boolean }>(
        '/api/oauth/userinfo',
      );
      setEmail(data.email ?? '');
      setVerified(Boolean(data.emailVerified));
    } catch {
      setVerified(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resend = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const data = await call<{ message?: string }>('/api/auth/verify-email/request', {
        method: 'POST',
      });
      setMessage({ kind: 'ok', text: data.message || 'Verification mail sent. Check your inbox.' });
    } catch (err) {
      setMessage({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Could not send the verification mail.',
      });
    } finally {
      setBusy(false);
    }
  }, []);

  // Unknown state (e.g. logged-out edge): render nothing rather than a lie.
  if (verified === null) return null;

  return (
    <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[var(--quant-foreground)]">Email verification</p>
          <p className="mt-0.5 truncate text-xs text-[var(--quant-muted-foreground)]">{email}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            verified
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-amber-500/15 text-amber-400'
          }`}
        >
          {verified ? 'Verified' : 'Not verified'}
        </span>
      </div>
      {!verified && (
        <>
          <p className="mt-3 text-xs leading-relaxed text-[var(--quant-muted-foreground)]">
            Verify your address to prove you own this mailbox. We will send a
            single-use link that expires in 24 hours.
          </p>
          {message && (
            <p
              className={`mt-2 text-xs ${message.kind === 'error' ? 'text-red-400' : 'text-emerald-400'}`}
              role={message.kind === 'error' ? 'alert' : 'status'}
            >
              {message.text}
            </p>
          )}
          <Button onClick={() => void resend()} disabled={busy} className="mt-3">
            {busy ? 'Sending…' : 'Send verification mail'}
          </Button>
        </>
      )}
    </div>
  );
}
