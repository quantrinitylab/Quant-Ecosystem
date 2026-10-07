'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, Button, LoadingState, ErrorState, EmptyState } from '@quant/shared-ui';
import { useAuth } from '@quant/shared-ui';

// ============================================================================
// QuantAds - Creator Marketplace (real identity + real credits-ledger endpoints)
// ============================================================================
// buyerId/creatorId come from the backend-verified useAuth() user (no more
// hardcoded 'user-1', no mock arrays). Every surface is wired to a real
// endpoint: browse (/marketplace), buy (/purchase, idempotent), my-purchases
// (/purchases/:buyerId), earnings (/earnings/:creatorId). Purchase failures
// (out-of-credits / already-owned) surface honestly.

interface Listing {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  type: string;
  priceCredits: number;
  status: string;
}

interface PurchaseRecord {
  id: string;
  purchaseId: string;
  buyerId: string;
  listingId: string;
  sellerId: string;
  priceCredits: number;
  createdAt: string;
}

interface Earnings {
  creatorId: string;
  earnings: number;
  withdrawable: number;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) {
    throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
  }
  return (body?.data ?? body) as T;
}

export default function CreatorPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const userId = user?.id ?? null;

  const [listings, setListings] = useState<Listing[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const loadAll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [market, mine, earn] = await Promise.all([
        getJson<Listing[]>('/api/creator-economy/marketplace'),
        getJson<PurchaseRecord[]>(`/api/creator-economy/purchases/${encodeURIComponent(userId)}`),
        getJson<Earnings>(`/api/creator-economy/earnings/${encodeURIComponent(userId)}`),
      ]);
      setListings(market);
      setPurchases(mine);
      setEarnings(earn);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load the marketplace');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (isAuthenticated) void loadAll();
  }, [isAuthenticated, loadAll]);

  const ownedListingIds = new Set(purchases.map((p) => p.listingId));

  const buy = useCallback(
    async (listing: Listing) => {
      if (!userId || buyingId) return;
      setBuyingId(listing.id);
      setNotice(null);
      try {
        const res = await fetch('/api/creator-economy/purchase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            buyerId: userId,
            listingId: listing.id,
            purchaseRef: globalThis.crypto.randomUUID(),
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body?.success === false) {
          throw new Error(body?.error?.message ?? `Purchase failed (${res.status})`);
        }
        setNotice({ kind: 'ok', text: `Purchased "${listing.title}".` });
        await loadAll();
      } catch (e) {
        setNotice({ kind: 'err', text: e instanceof Error ? e.message : 'Purchase failed' });
      } finally {
        setBuyingId(null);
      }
    },
    [userId, buyingId, loadAll],
  );

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
        <EmptyState
          title="Sign in to the Creator Marketplace"
          description="Sign in with your Quant account to browse, buy, and track your creator earnings."
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
      <h1 className="text-2xl font-bold mb-6">Creator Marketplace</h1>

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

      {/* Earnings (real ledger totals) */}
      <section className="mb-8" aria-label="Your creator earnings">
        <h2 className="text-lg font-semibold mb-3">Your Earnings</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-5">
            <p className="text-xs text-[var(--quant-muted-foreground)] uppercase tracking-wide">
              Earned (ledger)
            </p>
            <p className="text-2xl font-bold mt-2 text-[var(--quant-success)]">
              {earnings ? earnings.earnings.toLocaleString() : '—'} credits
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-xs text-[var(--quant-muted-foreground)] uppercase tracking-wide">
              Withdrawable
            </p>
            <p className="text-2xl font-bold mt-2">
              {earnings ? earnings.withdrawable.toLocaleString() : '—'} credits
            </p>
          </Card>
        </div>
      </section>

      {loading && <LoadingState variant="dots" text="Loading marketplace…" />}
      {error && <ErrorState message={error} onRetry={() => void loadAll()} />}

      {!loading && !error && (
        <>
          {/* Browse marketplace (real listings) */}
          <section className="mb-8" aria-label="Browse marketplace">
            <h2 className="text-lg font-semibold mb-3">Browse Marketplace</h2>
            {listings.length === 0 ? (
              <EmptyState
                title="No listings yet"
                description="Check back soon for creator items."
              />
            ) : (
              listings.map((listing) => {
                const owned = ownedListingIds.has(listing.id);
                const isMine = listing.creatorId === userId;
                return (
                  <Card key={listing.id} className="p-4 mb-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="font-medium text-sm truncate">{listing.title}</h3>
                        <p className="text-xs text-[var(--quant-muted-foreground)] mt-1">
                          {listing.description}
                        </p>
                        <p className="text-xs text-[var(--quant-muted-foreground)] mt-1">
                          {listing.priceCredits} credits · {listing.type}
                        </p>
                      </div>
                      {owned ? (
                        <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 font-medium whitespace-nowrap">
                          Owned
                        </span>
                      ) : isMine ? (
                        <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 whitespace-nowrap">
                          Your listing
                        </span>
                      ) : (
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={buyingId === listing.id}
                          onClick={() => void buy(listing)}
                        >
                          {buyingId === listing.id ? 'Buying…' : `Buy · ${listing.priceCredits}`}
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })
            )}
          </section>

          {/* My purchases (real entitlements) */}
          <section aria-label="My purchases">
            <h2 className="text-lg font-semibold mb-3">My Purchases</h2>
            {purchases.length === 0 ? (
              <EmptyState title="No purchases yet" description="Items you buy will appear here." />
            ) : (
              purchases.map((p) => (
                <Card key={p.id} className="p-4 mb-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Listing {p.listingId}</p>
                    <p className="text-xs text-[var(--quant-muted-foreground)]">
                      {p.priceCredits} credits · {new Date(p.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </Card>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
