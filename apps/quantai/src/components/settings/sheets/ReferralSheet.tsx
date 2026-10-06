// ============================================================================
// ReferralSheet — redeem a referral code.
// Posts to POST /api/quanty/referral/redeem. The referral program is not live
// yet, so the API honestly answers 501 and the UI relays that — no fake
// "success" state, and the wiring is ready for the real ledger later.
// ============================================================================
import React, { useState } from 'react';
import { SettingsSheet, SheetNote, SheetPrimaryButton } from '../SettingsSheet';
import { getAuthToken } from '../../../lib/auth';

export function ReferralSheet({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  async function handleRedeem() {
    setMessage(null);
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      setMessage({ kind: 'error', text: 'Enter a referral code first.' });
      return;
    }
    setBusy(true);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/quanty/referral/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ code: normalized }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        setMessage({ kind: 'info', text: json.message ?? 'Code redeemed.' });
        setCode('');
      } else {
        setMessage({
          kind: 'error',
          text: json?.error ?? 'Could not redeem the code. Please try again.',
        });
      }
    } catch {
      setMessage({ kind: 'error', text: 'Network error. Check your connection and try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsSheet
      title="Redeem referral code"
      subtitle="Have a code from a friend? Enter it below."
      onClose={onClose}
      testId="referral-sheet"
    >
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-white/60">Referral code</span>
        <input
          type="text"
          value={code}
          data-testid="referral-input"
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
          placeholder="QUANT-XXXXXX"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-center text-lg font-mono tracking-[0.2em] text-white placeholder:text-white/20 focus:border-blue-500/60 focus:outline-none"
        />
      </label>
      {message && (
        <p
          data-testid="referral-message"
          className={`mt-3 text-sm ${message.kind === 'error' ? 'text-red-400' : 'text-emerald-400'}`}
        >
          {message.text}
        </p>
      )}
      <div className="mt-4">
        <SheetPrimaryButton onClick={handleRedeem} disabled={busy} testId="referral-redeem">
          {busy ? 'Redeeming…' : 'Redeem'}
        </SheetPrimaryButton>
      </div>
      <SheetNote>
        Referral rewards are not live yet — codes are accepted for validation but no credits are
        granted right now. We'll never show a fake success.
      </SheetNote>
    </SettingsSheet>
  );
}
