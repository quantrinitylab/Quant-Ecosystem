// ============================================================================
// QuantChat - Discover Page
// Discover content feed with featured, trending, publishers
// ============================================================================
//
// STYLING ROOT-CAUSE FIX (P0, live audit 2026-10-11): like settings.tsx,
// this page used custom class names (discover-page, discover-header, ...)
// defined in NO stylesheet, so it rendered as raw browser-default HTML.
// It now uses the app's Tailwind + CSS-token system like calls.tsx.
//
// FUNCTIONAL FIXES (P1, same audit):
//  - The search box was decorative: typing did nothing. Search now filters
//    publishers and feed items by title/publisher and shows an honest
//    "no results" state.
//  - Publishers / For You rendered as bare headings over empty sections
//    when the backend returned nothing. Each section now has an explicit
//    empty state, and a total load failure shows an error + Retry instead
//    of a silently blank page.

import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import type { DiscoverItem, Publisher, DiscoverCategory } from '../types';
import { apiClient } from '../services/api-client';

export const DiscoverPage: React.FC = () => {
  const [feed, setFeed] = useState<DiscoverItem[]>([]);
  const [featured, setFeatured] = useState<DiscoverItem[]>([]);
  const [trending, setTrending] = useState<DiscoverItem[]>([]);
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [activeCategory, setActiveCategory] = useState<DiscoverCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const categories: Array<{ key: DiscoverCategory | 'all'; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'news', label: 'News' },
    { key: 'entertainment', label: 'Entertainment' },
    { key: 'gaming', label: 'Gaming' },
    { key: 'sports', label: 'Sports' },
    { key: 'music', label: 'Music' },
    { key: 'food', label: 'Food' },
    { key: 'technology', label: 'Tech' },
    { key: 'fashion', label: 'Fashion' },
  ];

  const loadContent = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    const category = activeCategory === 'all' ? undefined : activeCategory;

    const [feedRes, trendingRes, publishersRes] = await Promise.all([
      apiClient.getDiscoverFeed(category),
      apiClient.getTrendingContent(),
      apiClient.getPublishers(),
    ]);

    if (feedRes.success && feedRes.data) setFeed(feedRes.data);
    if (trendingRes.success && trendingRes.data) {
      setTrending(trendingRes.data);
      setFeatured(trendingRes.data.filter((i) => i.isFeatured));
    }
    if (publishersRes.success && publishersRes.data) setPublishers(publishersRes.data);

    if (!feedRes.success && !trendingRes.success && !publishersRes.success) {
      setLoadFailed(true);
    }

    setLoading(false);
  }, [activeCategory]);

  useEffect(() => {
    void loadContent();
  }, [loadContent]);

  const handleSubscribe = async (publisherId: string) => {
    await apiClient.subscribe(publisherId);
    setPublishers((prev) =>
      prev.map((p) =>
        p.id === publisherId ? { ...p, subscriberCount: p.subscriberCount + 1 } : p,
      ),
    );
  };

  const query = searchQuery.trim().toLowerCase();
  const matchesItem = (item: DiscoverItem) =>
    item.title.toLowerCase().includes(query) ||
    (item.publisherName ?? '').toLowerCase().includes(query);
  const filteredFeed = query ? feed.filter(matchesItem) : feed;
  const filteredPublishers = query
    ? publishers.filter((p) => p.name.toLowerCase().includes(query))
    : publishers;
  const noSearchResults = query.length > 0 && filteredFeed.length === 0 && filteredPublishers.length === 0;

  const publisherCard = (pub: Publisher) => (
    <div
      key={pub.id}
      className="flex items-center gap-3 rounded-xl p-3 hover:bg-[var(--quant-muted)]"
    >
      <img
        src={pub.avatarUrl}
        alt={pub.name}
        className="h-11 w-11 shrink-0 rounded-full object-cover"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {pub.name} {pub.isVerified && '✓'}
        </div>
        <div className="text-xs text-[var(--quant-muted-foreground)]">
          {formatViews(pub.subscriberCount)} subscribers
        </div>
      </div>
      <button
        type="button"
        className="min-h-[44px] shrink-0 rounded-full bg-emerald-500 px-4 text-sm font-semibold text-white hover:bg-emerald-600"
        onClick={() => void handleSubscribe(pub.id)}
      >
        Subscribe
      </button>
    </div>
  );

  const feedCard = (item: DiscoverItem) => (
    <div key={item.id} className="overflow-hidden rounded-xl bg-[var(--quant-muted)]">
      <img src={item.thumbnailUrl} alt={item.title} className="aspect-video w-full object-cover" />
      <div className="p-3">
        <h4 className="truncate text-sm font-medium">{item.title}</h4>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--quant-muted-foreground)]">
          <span className="truncate">{item.publisherName}</span>
          {item.duration ? (
            <span>
              {Math.floor(item.duration / 60)}:
              {(item.duration % 60).toString().padStart(2, '0')}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--quant-background)] text-[var(--quant-foreground)]">
      <Head>
        <title>Discover — QuantChat</title>
      </Head>
      <header className="sticky top-0 z-10 border-b border-[var(--quant-border)] bg-[var(--quant-surface)] px-4 py-3">
        <h1 className="text-lg font-semibold">Discover</h1>
        <div className="mt-3">
          <input
            type="search"
            placeholder="Search stories, shows, and more..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search Discover"
            className="quant-field min-h-[44px] w-full px-4 py-2 text-sm"
          />
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat.key}
              type="button"
              className={`min-h-[44px] shrink-0 rounded-full px-4 text-sm font-medium transition-colors ${
                activeCategory === cat.key
                  ? 'bg-emerald-500 text-white'
                  : 'bg-[var(--quant-muted)] text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-border)]'
              }`}
              aria-pressed={activeCategory === cat.key}
              onClick={() => setActiveCategory(cat.key)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-16" role="status">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--quant-border)] border-t-emerald-500" />
          <span className="sr-only">Loading content…</span>
        </div>
      ) : loadFailed ? (
        <div className="mx-4 mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-center">
          <p className="text-sm font-medium text-red-500">Couldn&apos;t load Discover</p>
          <p className="mt-1 text-sm text-[var(--quant-muted-foreground)]">
            Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={() => void loadContent()}
            className="mt-2 min-h-[44px] rounded-full bg-[var(--quant-muted)] px-4 text-sm font-medium"
          >
            Retry
          </button>
        </div>
      ) : (
        <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-5">
          {query ? (
            <>
              <section>
                <h2 className="mb-2 text-base font-semibold">
                  Results for &ldquo;{searchQuery.trim()}&rdquo;
                </h2>
                {noSearchResults ? (
                  <p className="py-6 text-center text-sm text-[var(--quant-muted-foreground)]">
                    No stories, shows, or publishers match your search.
                  </p>
                ) : (
                  <>
                    {filteredPublishers.length > 0 && (
                      <div className="space-y-1">{filteredPublishers.map(publisherCard)}</div>
                    )}
                    {filteredFeed.length > 0 && (
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {filteredFeed.map(feedCard)}
                      </div>
                    )}
                  </>
                )}
              </section>
            </>
          ) : (
            <>
              {/* Featured Section */}
              {featured.length > 0 && (
                <section>
                  <h2 className="mb-2 text-base font-semibold">Featured</h2>
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {featured.map((item) => (
                      <div
                        key={item.id}
                        className="relative w-64 shrink-0 overflow-hidden rounded-xl"
                      >
                        <img
                          src={item.thumbnailUrl}
                          alt={item.title}
                          className="aspect-video w-full object-cover"
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-black/60 p-3 text-white">
                          <span className="text-xs">{item.publisherName}</span>
                          <h3 className="truncate text-sm font-semibold">{item.title}</h3>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Trending Section */}
              {trending.length > 0 && (
                <section>
                  <h2 className="mb-2 text-base font-semibold">Trending</h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {trending.map((item) => (
                      <div
                        key={item.id}
                        className="overflow-hidden rounded-xl bg-[var(--quant-muted)]"
                      >
                        <img
                          src={item.thumbnailUrl}
                          alt={item.title}
                          className="aspect-video w-full object-cover"
                        />
                        <div className="flex items-center gap-2 p-3">
                          <img
                            src={item.publisherAvatarUrl}
                            alt={item.publisherName}
                            className="h-8 w-8 rounded-full object-cover"
                          />
                          <div className="min-w-0">
                            <h4 className="truncate text-sm font-medium">{item.title}</h4>
                            <div className="truncate text-xs text-[var(--quant-muted-foreground)]">
                              {item.publisherName} · {formatViews(item.viewCount)} views
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Publishers Section */}
              <section>
                <h2 className="mb-2 text-base font-semibold">Publishers</h2>
                {publishers.length === 0 ? (
                  <p className="py-6 text-center text-sm text-[var(--quant-muted-foreground)]">
                    No publishers yet — check back soon.
                  </p>
                ) : (
                  <div className="space-y-1">{publishers.map(publisherCard)}</div>
                )}
              </section>

              {/* Main Feed */}
              <section>
                <h2 className="mb-2 text-base font-semibold">For You</h2>
                {feed.length === 0 ? (
                  <p className="py-6 text-center text-sm text-[var(--quant-muted-foreground)]">
                    Nothing here yet — stories and shows from publishers will appear here.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {feed.map(feedCard)}
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      )}
    </div>
  );
};

function formatViews(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
}

export default DiscoverPage;
