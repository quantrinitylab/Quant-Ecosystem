// ============================================================================
// QuantChat - Spotlight Page (Tasks 13.5, 13.6, 13.7, 13.8)
//
//  - Curated feed of top reels ranked by engagement (likes, comments, shares,
//    watch-through rate) computed on the backend (13.5).
//  - Ranking refreshes every 15 minutes; the page re-fetches on that cadence and
//    surfaces the last-ranked time (13.6).
//  - Top-ranked reels render a "Featured" badge (13.7).
//  - Ordering is personalized via @quant/recommendation when available, else it
//    falls back to engagement-only ordering; a "For you" indicator reflects
//    which mode is active (13.8).
// ============================================================================
'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { BottomNav } from '@quant/shared-ui';
import { useSpotlight, type SpotlightReel } from '../../hooks/useSpotlight';
import { FeaturedBadge } from './components/FeaturedBadge';
import { navItems, routes } from '../../lib/navigation';

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function SpotlightCard({ reel, rank }: { reel: SpotlightReel; rank: number }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(rank * 0.03, 0.3) }}
      whileTap={{ scale: 0.98 }}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900"
    >
      <div className="relative aspect-[9/16] bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={reel.thumbnailUrl}
          alt={reel.caption}
          className="h-full w-full object-cover transition group-hover:scale-105"
        />
        <div className="absolute left-2 top-2 flex items-center gap-2">
          <span className="rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold text-white">
            #{rank + 1}
          </span>
          {reel.isFeatured && <FeaturedBadge />}
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-3">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={reel.creatorAvatar}
              alt={reel.creatorUsername}
              className="h-6 w-6 rounded-full border border-white/20"
            />
            <span className="text-xs font-semibold text-white">@{reel.creatorUsername}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-gray-200">{reel.caption}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-gray-300">
        <span title="Likes">❤️ {formatCount(reel.likeCount)}</span>
        <span title="Comments">💬 {formatCount(reel.commentCount)}</span>
        <span title="Shares">🔁 {formatCount(reel.shareCount)}</span>
        <span title="Watch-through rate">▶ {Math.round(reel.watchThroughRate * 100)}%</span>
      </div>
    </motion.article>
  );
}

export default function SpotlightPage() {
  const router = useRouter();
  const { reels, rankedAt, personalized, isLoading, isError, refetch } = useSpotlight();

  return (
    <div className="min-h-dvh bg-gradient-to-b from-black via-zinc-950 to-black text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 pb-20">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/')}
              aria-label="Back to chats"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg transition hover:bg-white/20 active:scale-95"
            >
              &#8592;
            </button>
            <div>
              <h1 className="text-2xl font-bold">Spotlight</h1>
              <p className="text-sm text-gray-400">
                Top community reels{' '}
                {personalized ? (
                  <span className="text-fuchsia-400">· personalized for you</span>
                ) : (
                  <span className="text-gray-500">· trending now</span>
                )}
              </p>
            </div>
          </div>
          {rankedAt && (
            <span className="text-xs text-gray-500">
              Updated {new Date(rankedAt).toLocaleTimeString()}
            </span>
          )}
        </header>

        {isError ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <p className="text-gray-400">Couldn&apos;t load Spotlight.</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/20 active:scale-95"
            >
              Retry
            </button>
          </div>
        ) : isLoading && reels.length === 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[9/16] animate-pulse rounded-2xl border border-white/10 bg-white/5"
              />
            ))}
          </div>
        ) : reels.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-24 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-3xl">
              &#10024;
            </div>
            <h2 className="text-lg font-semibold text-white">No reels yet</h2>
            <p className="max-w-xs text-sm text-gray-400">
              Be the first to share a reel with the community — the top reels get
              featured right here.
            </p>
            <button
              type="button"
              onClick={() => router.push(routes.camera)}
              className="mt-1 rounded-full bg-gradient-to-r from-fuchsia-500 to-purple-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 active:scale-95"
            >
              Create your first reel
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {reels.map((reel, index) => (
              <SpotlightCard key={reel.id} reel={reel} rank={index} />
            ))}
          </div>
        )}
      </div>

      <BottomNav
        items={navItems}
        activeId="spotlight"
        onChange={(id) => {
          const route = routes[id];
          if (route) router.push(route);
        }}
      />
    </div>
  );
}
