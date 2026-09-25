// ============================================================================
// QuantTube - Home Page
// Video platform home with category tabs, video grid, infinite scroll
// ============================================================================

import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import { LoadingState, EmptyState } from '@quant/shared-ui';
import { useVideos } from '../hooks/useVideos';
import { useAuth } from '../providers/auth-provider';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { getGuestFeaturedVideos } from '../data/public-videos';

interface Category {
  id: string;
  label: string;
}

const CATEGORIES: Category[] = [
  { id: 'all', label: 'All' },
  { id: 'music', label: 'Music' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'news', label: 'News' },
  { id: 'sports', label: 'Sports' },
  { id: 'education', label: 'Education' },
  { id: 'entertainment', label: 'Entertainment' },
  { id: 'tech', label: 'Technology' },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16, scale: 0.97 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', ...spring.gentle },
  },
};

const HomePage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const categoryParam = activeCategory === 'all' ? undefined : activeCategory;
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useVideos(categoryParam);

  const videos = useMemo(() => {
    const list = data?.pages?.flatMap((page) => page.videos) ?? [];
    if (list.length === 0 && !isLoading) {
      return getGuestFeaturedVideos(categoryParam);
    }
    return list;
  }, [data, isLoading, categoryParam]);

  const isGuestMode = useMemo(() => {
    return !isAuthenticated || data?.pages?.some((p) => p.isGuestFallback) || Boolean(error);
  }, [isAuthenticated, data, error]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.target as HTMLDivElement;
      if (
        target.scrollHeight - target.scrollTop - target.clientHeight < 400 &&
        hasNextPage &&
        !isFetchingNextPage
      ) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  const formatViews = useCallback((views: number): string => {
    if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M views`;
    if (views >= 1000) return `${(views / 1000).toFixed(1)}K views`;
    return `${views} views`;
  }, []);

  const formatDuration = useCallback((seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, []);

  if (isLoading && videos.length === 0) {
    return (
      <div className="min-h-screen bg-[var(--quant-background)] p-4 md:p-6 lg:p-8">
        <div className="max-w-[1440px] mx-auto">
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            {Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                className="h-9 w-20 rounded-full bg-[var(--surface-elevated)] animate-shimmer flex-shrink-0"
              />
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 md:gap-6">
            <LoadingSkeleton variant="video-card" count={12} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[var(--quant-background)] text-[var(--quant-foreground)] overflow-y-auto"
      onScroll={handleScroll}
    >
      <div className="max-w-[1440px] mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6">
        {/* Engaging Guest / Unauthenticated Welcome Banner */}
        {isGuestMode && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 md:p-6 rounded-2xl bg-gradient-to-r from-[var(--brand-primary)]/15 via-[var(--surface-elevated)] to-[var(--brand-primary)]/5 border border-[var(--brand-primary)]/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--brand-primary)] text-white flex items-center justify-center font-bold text-xl shadow-md flex-shrink-0">
                ▶
              </div>
              <div>
                <h2 className="text-lg md:text-xl font-bold text-[var(--quant-foreground)] tracking-tight">
                  Welcome to QuanTube — Stream Videos &amp; Music
                </h2>
                <p className="text-sm text-[var(--quant-muted-foreground)] mt-0.5">
                  Sign in with Quant Account to subscribe and like, follow creators, and save your
                  favorites.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto">
              <button
                onClick={() => {
                  const returnTo = encodeURIComponent(
                    typeof window !== 'undefined' ? window.location.pathname : '/',
                  );
                  window.location.href = `/login?returnTo=${returnTo}`;
                }}
                className="px-6 py-2.5 rounded-full bg-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/90 text-white font-medium text-sm transition-all shadow hover:shadow-md whitespace-nowrap w-full md:w-auto text-center"
              >
                Sign In
              </button>
            </div>
          </motion.div>
        )}

        {/* Category Tabs */}
        <nav
          className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-none"
          aria-label="Content categories"
        >
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              className={`relative px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap min-h-[44px] min-w-[44px] transition-colors ${
                activeCategory === cat.id
                  ? 'bg-[var(--brand-primary)] text-white'
                  : 'bg-[var(--surface-elevated)] text-[var(--foreground-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]'
              }`}
              onClick={() => setActiveCategory(cat.id)}
              aria-pressed={activeCategory === cat.id}
            >
              {cat.label}
              {activeCategory === cat.id && (
                <motion.div
                  layoutId="active-category"
                  className="absolute inset-0 bg-[var(--brand-primary)] rounded-full -z-10"
                  transition={{ type: 'spring', ...spring.snappy }}
                />
              )}
            </button>
          ))}
        </nav>

        {/* Video Grid */}
        <AnimatePresence mode="wait">
          {videos.length === 0 ? (
            <EmptyState title="No videos found" description="Try a different category" />
          ) : (
            <motion.div
              key={activeCategory}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 md:gap-6"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              role="list"
              aria-label="Video grid"
            >
              {videos.map(
                (video: {
                  id: string;
                  title?: string;
                  thumbnail?: string;
                  thumbnailUrl?: string;
                  channelName?: string;
                  channelAvatar?: string;
                  views?: number;
                  viewCount?: number;
                  uploadedAt?: string;
                  publishedAt?: string;
                  duration?: number;
                  isLive?: boolean;
                }) => {
                  const thumbnailSrc =
                    video.thumbnail ||
                    video.thumbnailUrl ||
                    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80';
                  const avatarSrc =
                    video.channelAvatar ||
                    `https://api.dicebear.com/7.x/identicon/svg?seed=${video.channelName || 'creator'}`;
                  const displayViews = video.views ?? video.viewCount ?? 0;
                  const displayDate = video.uploadedAt || video.publishedAt || 'Recently';

                  return (
                    <motion.div
                      key={video.id}
                      variants={itemVariants}
                      whileHover={{ scale: 1.02, transition: { type: 'spring', ...spring.snappy } }}
                      className="flex flex-col rounded-xl overflow-hidden bg-[var(--quant-card)] border border-[var(--quant-border)] cursor-pointer group"
                      onClick={() => {
                        window.location.href = `/watch/${video.id}`;
                      }}
                      role="listitem"
                    >
                      <div className="relative aspect-video overflow-hidden bg-black/10">
                        <img
                          src={thumbnailSrc}
                          alt={video.title || 'Video'}
                          loading="lazy"
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80';
                          }}
                        />
                        {video.isLive ? (
                          <span className="absolute bottom-2 left-2 bg-[var(--brand-primary)] text-white text-xs font-bold px-2 py-0.5 rounded">
                            LIVE
                          </span>
                        ) : (
                          <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
                            {formatDuration(video.duration || 0)}
                          </span>
                        )}
                      </div>
                      <div className="p-3 flex gap-3">
                        <img
                          className="w-9 h-9 rounded-full flex-shrink-0 object-cover bg-gray-700/20"
                          src={avatarSrc}
                          alt={video.channelName || 'Channel'}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              `https://api.dicebear.com/7.x/identicon/svg?seed=${video.channelName || 'creator'}`;
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-[var(--quant-foreground)] line-clamp-2 leading-tight">
                            {video.title}
                          </h3>
                          <p className="text-xs text-[var(--quant-muted-foreground)] mt-1">
                            {video.channelName || 'Quant Creator'}
                          </p>
                          <p className="text-xs text-[var(--quant-muted-foreground)]">
                            {formatViews(displayViews)} &middot; {displayDate}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  );
                },
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {isFetchingNextPage && (
          <div className="flex justify-center py-8">
            <LoadingState variant="dots" text="Loading more..." size="sm" />
          </div>
        )}
      </div>
    </div>
  );
};

export default HomePage;
