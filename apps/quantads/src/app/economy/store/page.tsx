'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, Button, LoadingState, ErrorState, EmptyState, useAuth } from '@quant/shared-ui';
import { spring } from '@quant/brand';
import type { VirtualGood, GoodCategory, InventoryItem } from '@quant/quant-economy';
import { apiFetchRaw } from '@quant/api-client';

// ============================================================================
// QuantAds - Virtual Goods Store (real backend endpoints, no mock data)
// ============================================================================
//
// The page previously rendered a hardcoded `mockItems` array — 12 invented
// virtual goods with made-up coin prices — as if it were the store catalog.
// Every surface below is now wired to the real store backend:
//
//   GET  /api/store/catalog?category=…  -> VirtualGoodsCatalog (the source of
//                                          truth; honestly empty until goods
//                                          are listed)
//   POST /api/store/purchase            -> real coin-ledger purchase + inventory
//   GET  /api/store/inventory/:userId   -> items the user already owns
//
// Purchase failures (item not found / insufficient balance) surface honestly.

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', ...spring.gentle } },
};

const CATEGORIES: { key: GoodCategory; label: string }[] = [
  { key: 'avatar_item', label: 'Avatars' },
  { key: 'outfit', label: 'Outfits' },
  { key: 'skin', label: 'Skins' },
  { key: 'chat_theme', label: 'Themes' },
  { key: 'sticker_pack', label: 'Stickers' },
  { key: 'gift_item', label: 'Gifts' },
];

async function getJson<T>(url: string): Promise<T> {
  const res = await apiFetchRaw(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) {
    throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
  }
  return (body?.data ?? body) as T;
}

export default function StorePage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const userId = user?.id ?? null;

  const [activeCategory, setActiveCategory] = useState<GoodCategory>('avatar_item');
  const [items, setItems] = useState<VirtualGood[]>([]);
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const loadAll = useCallback(
    async (category: GoodCategory) => {
      setLoading(true);
      setError(null);
      try {
        const [catalogItems, inventory] = await Promise.all([
          getJson<VirtualGood[]>(`/api/store/catalog?category=${category}`),
          userId
            ? getJson<{ items: InventoryItem[] }>(
                `/api/store/inventory/${encodeURIComponent(userId)}`,
              )
                .then((r) => r.items)
                .catch(() => [] as InventoryItem[])
            : Promise.resolve([] as InventoryItem[]),
        ]);
        setItems(catalogItems);
        setOwnedIds(new Set(inventory.map((i) => i.itemId)));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load the store');
      } finally {
        setLoading(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    void loadAll(activeCategory);
  }, [activeCategory, loadAll]);

  const purchase = useCallback(
    async (item: VirtualGood) => {
      if (!userId || purchasingId) return;
      setPurchasingId(item.id);
      setNotice(null);
      try {
        const res = await apiFetchRaw('/api/store/purchase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, itemId: item.id }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body?.success === false) {
          throw new Error(body?.error?.message ?? `Purchase failed (${res.status})`);
        }
        setNotice({ kind: 'ok', text: `Purchased "${item.name}".` });
        setOwnedIds((prev) => new Set(prev).add(item.id));
      } catch (e) {
        setNotice({ kind: 'err', text: e instanceof Error ? e.message : 'Purchase failed' });
      } finally {
        setPurchasingId(null);
      }
    },
    [userId, purchasingId],
  );

  if (authLoading || loading) {
    return (
      <div className="max-w-4xl mx-auto py-16">
        <LoadingState variant="skeleton" text="Loading store…" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Virtual Goods Store</h1>

      {error && (
        <div className="mb-6">
          <ErrorState message={error} onRetry={() => void loadAll(activeCategory)} retryLabel="Retry" />
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

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeCategory === cat.key
                ? 'bg-[var(--quant-primary)] text-white'
                : 'bg-[var(--quant-muted)] text-[var(--quant-foreground)] hover:bg-[var(--quant-border)]'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Item Grid */}
      {items.length === 0 && !error ? (
        <EmptyState
          title="No items listed yet"
          description="The store catalog is empty in this category. Goods will appear here once they are listed."
        />
      ) : (
        <motion.div
          key={activeCategory}
          className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4"
          variants={staggerContainer}
          initial="hidden"
          animate="show"
        >
          {items.map((item) => {
            const owned = ownedIds.has(item.id);
            return (
              <motion.div key={item.id} variants={staggerItem}>
                <Card className="p-4 flex flex-col h-full">
                  {/* Image Placeholder */}
                  <div className="w-full h-32 bg-[var(--quant-muted)] rounded-md mb-3 flex items-center justify-center">
                    <span className="text-[var(--quant-muted-foreground)] text-xs">Preview</span>
                  </div>
                  <h3 className="font-medium text-sm">{item.name}</h3>
                  <p className="text-xs text-[var(--quant-muted-foreground)] mt-1 flex-1">
                    {item.description}
                  </p>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-sm font-bold">{item.priceCoins} coins</span>
                    {owned ? (
                      <span className="text-xs font-medium text-green-700">Owned</span>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => void purchase(item)}
                        disabled={!isAuthenticated || purchasingId !== null}
                      >
                        {purchasingId === item.id ? 'Buying…' : 'Purchase'}
                      </Button>
                    )}
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
