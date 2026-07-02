'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, Button, LoadingState, ErrorState, EmptyState } from '@quant/shared-ui';
import { useAuth } from '@quant/shared-ui';

// ============================================================================
// QuantAds - Coin Wallet (real credits-ledger balance + real daily-earn)
// ============================================================================
// Bucket A (wired to durable endpoints): balance (GET /economy/wallet/:userId)
// and the daily-login reward (POST /economy/wallet/earn/daily). Bucket B
// (no durable endpoint yet — honestly gated, never mocked): buy-coins catalog +
// payment (needs a coin-pack catalog + live payment rail), transaction history
// (needs a ledger-list endpoint), and referral links. No user-1 / mock arrays.

export default function WalletPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const userId = user?.id ?? null;

  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const loadBalance = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/economy/wallet/${encodeURIComponent(userId)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) {
        throw new Error(body?.error?.message ?? `Failed to load balance (${res.status})`);
      }
      setBalance((body?.data ?? body)?.balance ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load your wallet');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (isAuthenticated) void loadBalance();
  }, [isAuthenticated, loadBalance]);

  const claimDaily = useCallback(async () => {
    if (!userId || claiming) return;
    setClaiming(true);
    setNotice(null);
    try {
      const res = await fetch('/api/economy/earn/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) {
        throw new Error(body?.error?.message ?? `Claim failed (${res.status})`);
      }
      const data = (body?.data ?? body) as { success?: boolean; coins?: number };
      setNotice(
        data.success
          ? { kind: 'ok', text: `Claimed ${data.coins ?? 0} credits.` }
          : { kind: 'err', text: 'Already claimed today.' },
      );
      await loadBalance();
    } catch (e) {
      setNotice({ kind: 'err', text: e instanceof Error ? e.message : 'Claim failed' });
    } finally {
      setClaiming(false);
    }
  }, [userId, claiming, loadBalance]);

  if (authLoading) {
    return (
      <div className="max-w-4xl mx-auto py-16">
        <LoadingState variant="skeleton" text="Loading…" />
      </div>
    );
  }
  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto py-16 text-center">
        <EmptyState
          title="Sign in to view your wallet"
          description="Sign in with your Quant account."
        />
        <Link href="/auth/login">
          <Button variant="primary" className="mt-4">
            Sign in
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Coin Wallet</h1>

      {notice && (
        <div
          role="status"
          className={`mb-4 rounded-lg px-4 py-2 text-sm ${
            notice.kind === 'ok' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Balance (real, credits ledger) */}
      <Card className="p-8 mb-8 text-center">
        <p className="text-sm text-[var(--quant-muted-foreground)] uppercase tracking-wide">
          Your Balance
        </p>
        {loading ? (
          <div className="mt-3">
            <LoadingState variant="dots" text="Loading balance…" size="sm" />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={() => void loadBalance()} />
        ) : (
          <>
            <p className="text-5xl font-bold mt-2">{(balance ?? 0).toLocaleString()}</p>
            <p className="text-sm text-[var(--quant-muted-foreground)] mt-1">Quant Credits</p>
          </>
        )}
      </Card>

      {/* Earn (real daily-login reward) */}
      <section className="mb-8" aria-label="Earn credits">
        <h2 className="text-lg font-semibold mb-3">Earn Credits</h2>
        <Card className="p-4">
          <h3 className="font-medium text-sm mb-2">Daily Login Reward</h3>
          <p className="text-xs text-[var(--quant-muted-foreground)] mb-3">
            Claim your free credits once per day.
          </p>
          <Button variant="primary" size="sm" disabled={claiming} onClick={() => void claimDaily()}>
            {claiming ? 'Claiming…' : 'Claim Daily Login'}
          </Button>
        </Card>
      </section>

      {/* Bucket B — honestly gated (no mock): needs durable backend / live rail. */}
      <section aria-label="Coming soon">
        <h2 className="text-lg font-semibold mb-3">Buy Credits &amp; History</h2>
        <Card className="p-4">
          <p className="text-sm text-[var(--quant-muted-foreground)]">
            Buying credits (live payment rail) and transaction history are coming soon. We only show
            data backed by a real endpoint — nothing mocked.
          </p>
        </Card>
      </section>
    </div>
  );
}
