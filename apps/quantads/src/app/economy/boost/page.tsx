'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, Button, LoadingState, ErrorState, EmptyState, useAuth } from '@quant/shared-ui';
import { spring } from '@quant/brand';
import type { BoostPack, BoostAnalytics, BoostRequest } from '@quant/quant-economy';

// ============================================================================
// QuantAds - Self-Boost (real backend endpoints, no mock data)
// ============================================================================
//
// The page previously rendered two hardcoded constants — `mockActiveBoosts`
// (invented boost analytics) and `mockPosts` (invented post list) — as if they
// were the user's real boosts and posts. Every surface below is now wired to
// the real boost backend:
//
//   GET  /api/boost/packs            -> BoostPackRegistry defaults
//   GET  /api/boost/active/:userId   -> the user's real active boosts
//   GET  /api/boost/analytics/:boostId -> real per-boost analytics (0 for new)
//   POST /api/boost/activate         -> real coin-ledger spend + boost record
//
// There is no post-catalog endpoint in QuantAds, so instead of inventing the
// user's posts the page asks for a post/reel ID directly. Analytics start at
// zero for a fresh boost — an empty state a user can trust beats a chart that
// invents their reach.

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', ...spring.gentle } },
};

interface BoostWithAnalytics {
  boost: BoostRequest;
  analytics: BoostAnalytics | null;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) {
    throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
  }
  return (body?.data ?? body) as T;
}

export default function BoostPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const userId = user?.id ?? null;

  const [packs, setPacks] = useState<BoostPack[]>([]);
  const [boosts, setBoosts] = useState<BoostWithAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [postId, setPostId] = useState('');
  const [activating, setActivating] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const loadAll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [packList, activeBoosts] = await Promise.all([
        getJson<BoostPack[]>('/api/boost/packs'),
        getJson<BoostRequest[]>(`/api/boost/active/${encodeURIComponent(userId)}`),
      ]);
      setPacks(packList);
      const withAnalytics = await Promise.all(
        activeBoosts.map(async (boost) => {
          try {
            const analytics = await getJson<BoostAnalytics>(
              `/api/boost/analytics/${encodeURIComponent(boost.id)}`,
            );
            return { boost, analytics };
          } catch {
            return { boost, analytics: null };
          }
        }),
      );
      setBoosts(withAnalytics);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load boost data');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (isAuthenticated) void loadAll();
  }, [isAuthenticated, loadAll]);

  const activate = useCallback(async () => {
    if (!userId || !selectedPackId || !postId.trim() || activating) return;
    setActivating(true);
    setNotice(null);
    try {
      const res = await fetch('/api/boost/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, postId: postId.trim(), packId: selectedPackId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) {
        throw new Error(body?.error?.message ?? `Boost failed (${res.status})`);
      }
      setNotice({ kind: 'ok', text: `Boost activated for post "${postId.trim()}".` });
      setPostId('');
      setSelectedPackId(null);
      await loadAll();
    } catch (e) {
      setNotice({ kind: 'err', text: e instanceof Error ? e.message : 'Boost activation failed' });
    } finally {
      setActivating(false);
    }
  }, [userId, selectedPackId, postId, activating, loadAll]);

  // --- auth gate -----------------------------------------------------------
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
        <p className="text-lg font-semibold">Sign in to use Self-Boost</p>
        <p className="text-sm text-[var(--quant-muted-foreground)] mt-2">
          Boosting is tied to your account and coin balance.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-16">
        <LoadingState variant="skeleton" text="Loading boost data…" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Self-Boost</h1>

      {/* Clear distinction from ads */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p className="text-sm font-semibold text-blue-800">Organic Boost - NOT an advertisement</p>
        <p className="text-xs text-blue-700 mt-1">
          Boost amplifies your organic reach. Your content will not carry a sponsored label and will
          appear as natural content in feeds. This is purely a reach multiplier for your own posts
          and reels.
        </p>
      </div>

      {error && (
        <div className="mb-6">
          <ErrorState message={error} onRetry={() => void loadAll()} retryLabel="Retry" />
        </div>
      )}

      {notice && (
        <div
          className={`rounded-lg p-3 mb-6 text-sm ${
            notice.kind === 'ok'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          {notice.text}
        </div>
      )}

      {/* Boost Pack Tiers */}
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Boost Packs</h2>
        {packs.length === 0 ? (
          <EmptyState
            title="No boost packs available"
            description="Boost packs are not configured yet."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {packs.map((pack) => (
              <motion.div key={pack.id} variants={staggerItem}>
                <Card
                  className={`p-5 text-center cursor-pointer transition-colors ${
                    selectedPackId === pack.id ? 'ring-2 ring-[var(--quant-primary)]' : ''
                  }`}
                >
                  <h3 className="font-bold text-lg">{pack.name}</h3>
                  <p className="text-3xl font-bold mt-2 text-[var(--quant-primary)]">
                    {pack.multiplier}x
                  </p>
                  <p className="text-xs text-[var(--quant-muted-foreground)] mt-1">
                    reach multiplier
                  </p>
                  <p className="text-sm font-medium mt-3">{pack.costCoins} coins</p>
                  <Button
                    variant={selectedPackId === pack.id ? 'primary' : 'secondary'}
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => setSelectedPackId(pack.id)}
                  >
                    {selectedPackId === pack.id ? 'Selected' : 'Select'}
                  </Button>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Boost a post — no post catalog exists in QuantAds, so the user provides
          the post/reel ID directly instead of picking from an invented list. */}
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="mb-8">
        <h2 className="text-lg font-semibold mb-3">Boost a Post or Reel</h2>
        <Card className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={postId}
              onChange={(e) => setPostId(e.target.value)}
              placeholder="Post or reel ID (e.g. from QuantWave or QuantGram)"
              className="flex-1 px-4 py-2 bg-[var(--quant-muted)] border border-[var(--quant-border)] rounded-md text-sm focus:outline-none"
            />
            <Button
              variant="primary"
              onClick={activate}
              disabled={!selectedPackId || !postId.trim() || activating}
            >
              {activating ? 'Boosting…' : 'Boost Now'}
            </Button>
          </div>
          <p className="text-xs text-[var(--quant-muted-foreground)] mt-2">
            Select a pack above, paste the ID of your post or reel, then boost. Coins are spent from
            your real wallet balance.
          </p>
        </Card>
      </motion.div>

      {/* Active Boosts with real analytics */}
      <motion.div variants={staggerContainer} initial="hidden" animate="show">
        <h2 className="text-lg font-semibold mb-3">Active Boosts</h2>
        {boosts.length === 0 ? (
          <EmptyState
            title="No active boosts"
            description="You have not boosted any posts yet. Select a pack above to get started."
          />
        ) : (
          boosts.map(({ boost, analytics }) => (
            <motion.div key={boost.id} variants={staggerItem}>
              <Card className="p-4 mb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-sm">Post: {boost.postId}</h3>
                    <p className="text-xs text-[var(--quant-muted-foreground)] mt-1">
                      Reach multiplier: {boost.multiplier}x
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">
                      {(analytics?.impressions ?? 0).toLocaleString()} impressions
                    </p>
                    <p className="text-xs text-[var(--quant-muted-foreground)]">
                      Organic reach: {(analytics?.organicReach ?? 0).toLocaleString()}
                    </p>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))
        )}
      </motion.div>
    </div>
  );
}
