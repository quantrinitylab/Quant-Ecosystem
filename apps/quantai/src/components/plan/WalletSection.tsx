'use client';

// ============================================================================
// WalletSection — credits wallet: balances + earn/spend history.
// Real ledger data only; honest empty state when the wallet is not configured.
// ============================================================================

import React, { useEffect, useState } from 'react';
import { getAuthHeaders } from '../../lib/auth';
import { formatCompact, type WalletData } from './types';
import { apiFetchRaw } from '@quant/api-client';

const BUCKET_LABELS: Record<string, string> = {
  DAILY: 'Daily allowance',
  MONTHLY: 'Monthly credits',
  PURCHASED: 'Purchased',
};

export default function WalletSection() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetchRaw('/api/quanty/wallet', { headers: getAuthHeaders() })
      .then(async (r) => {
        const j = await r.json();
        if (!cancelled) {
          if (j.success) setWallet(j.data);
          else setError(j.error?.message ?? 'Could not load wallet');
        }
      })
      .catch(() => !cancelled && setError('Could not load wallet'));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="text-[14px] text-[#FF453A]">{error}</p>;
  if (!wallet) return <p className="text-[14px] text-white/50">Loading wallet…</p>;

  if (!wallet.configured) {
    return (
      <p className="text-[14px] text-white/50">
        The credits wallet is not connected yet. Balances will appear here once billing is enabled.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[14px] text-white/50">Total balance</span>
        <span className="text-[28px] font-semibold text-white">{formatCompact(wallet.balance.total)}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {(['daily', 'monthly', 'purchased'] as const).map((b) => (
          <div key={b} className="rounded-2xl bg-white/5 p-3">
            <p className="text-[12px] text-white/50">{BUCKET_LABELS[b.toUpperCase()]}</p>
            <p className="mt-1 text-[18px] font-semibold text-white">{formatCompact(wallet.balance[b])}</p>
          </div>
        ))}
      </div>

      <h3 className="mt-5 text-[15px] font-semibold text-white">History</h3>
      {wallet.history.length === 0 ? (
        <p className="mt-2 text-[14px] text-white/50">No credit activity yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-white/10">
          {wallet.history.map((h) => (
            <li key={h.id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-[14px] text-white">{h.reason ?? h.entryType.replace(/_/g, ' ')}</p>
                <p className="text-[12px] text-white/50">
                  {BUCKET_LABELS[h.bucket] ?? h.bucket} · {new Date(h.createdAt).toLocaleDateString()}
                </p>
              </div>
              <span className={`text-[15px] font-medium ${h.amount >= 0 ? 'text-[#30D158]' : 'text-white/80'}`}>
                {h.amount >= 0 ? '+' : ''}{formatCompact(h.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
