'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, Button, LoadingState, ErrorState, EmptyState } from '@quant/shared-ui';
import { useAuth } from '@quant/shared-ui';

// ============================================================================
// QuantAds - Economy Overview (real credits-ledger balance)
// ============================================================================
// Balance is wired to the durable credits ledger (GET /economy/wallet/:userId)
// on the backend-verified useAuth() user. Plan tier, active-boosts count, and
// recent transactions have no durable endpoint yet — honestly linked out / gated
// rather than shown with mock data (no user-1, no mock arrays).

export default function EconomyOverviewPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const userId = user?.id ?? null;

  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      setError(e instanceof Error ? e.message : 'Failed to load your balance');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (isAuthenticated) void loadBalance();
  }, [isAuthenticated, loadBalance]);

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
          title="Sign in to your economy"
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
      <h1 className="text-2xl font-bold mb-6">Economy Overview</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card className="p-5">
          <p className="text-xs text-[var(--quant-muted-foreground)] uppercase tracking-wide">
            Wallet Balance
          </p>
          {loading ? (
            <div className="mt-2">
              <LoadingState variant="dots" text="Loading…" size="sm" />
            </div>
          ) : error ? (
            <ErrorState message={error} onRetry={() => void loadBalance()} />
          ) : (
            <p className="text-3xl font-bold mt-2">{(balance ?? 0).toLocaleString()} credits</p>
          )}
        </Card>
        <Card className="p-5">
          <p className="text-xs text-[var(--quant-muted-foreground)] uppercase tracking-wide">
            Creator Marketplace
          </p>
          <Link
            href="/economy/creator"
            className="text-sm font-medium mt-2 inline-block text-[var(--brand-primary)] hover:underline"
          >
            Browse &amp; sell &rarr;
          </Link>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-[var(--quant-muted-foreground)] uppercase tracking-wide">
            Wallet
          </p>
          <Link
            href="/economy/wallet"
            className="text-sm font-medium mt-2 inline-block text-[var(--brand-primary)] hover:underline"
          >
            View balance &amp; earn &rarr;
          </Link>
        </Card>
      </div>

      {/* Quick Actions — link to real, wired surfaces only. */}
      <section className="mb-8" aria-label="Quick actions">
        <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/economy/wallet">
            <Button variant="primary" size="sm">
              Wallet
            </Button>
          </Link>
          <Link href="/economy/creator">
            <Button variant="secondary" size="sm">
              Creator Marketplace
            </Button>
          </Link>
        </div>
      </section>

      {/* Bucket B — honestly gated (no mock): plan tier, active boosts, and a
          recent-transactions feed need durable endpoints. */}
      <section aria-label="Coming soon">
        <h2 className="text-lg font-semibold mb-3">More</h2>
        <Card className="p-4">
          <p className="text-sm text-[var(--quant-muted-foreground)]">
            Plan tier, active-boost counts, and a recent-transactions feed are coming soon — shown
            only once backed by a real endpoint (no mock data).
          </p>
        </Card>
      </section>
    </div>
  );
}
