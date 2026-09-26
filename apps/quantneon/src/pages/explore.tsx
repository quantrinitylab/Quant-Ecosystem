// ============================================================================
// QuantNeon - Explore/Discover Page
// Category tabs, search, trending hashtags, masonry grid (real backend data)
// ============================================================================

import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/router';
import { spring } from '@quant/brand';
import { PageTransition, ErrorState, EmptyState } from '@quant/shared-ui';
import { useExplore } from '../hooks/useExplore';
import { useAuth } from '../providers/auth-provider';
import { GuestInteractionGate } from '../components/GuestInteractionGate';
import { getGuestFeaturedPosts } from '../data/public-reels';
import type { Post } from '../types';

type Category = 'For You' | 'Travel' | 'Food' | 'Art' | 'Fashion' | 'Sports' | 'Music';

const CATEGORIES: Category[] = ['For You', 'Travel', 'Food', 'Art', 'Fashion', 'Sports', 'Music'];

const TRENDING_TAGS = [
  '#SummerVibes',
  '#Photography',
  '#OOTD',
  '#FoodPorn',
  '#TravelGram',
  '#ArtOfTheDay',
  '#FitnessMotivation',
  '#Sunset',
  '#Minimal',
];

interface ExplorePost {
  id: string;
  thumbnailUrl: string;
  type: string;
  likeCount: number;
  username: string;
  caption: string;
  hashtags: string[];
  span: 'normal' | 'tall' | 'wide';
}

function toExplorePost(post: Post, index: number): ExplorePost {
  const urls = post.mediaUrls ?? [];
  const spanOptions: ExplorePost['span'][] = ['normal', 'normal', 'normal', 'tall', 'wide'];
  return {
    id: post.id,
    thumbnailUrl: urls[0] ?? '',
    type: String(post.type).toUpperCase() === 'VIDEO' ? 'video' : 'image',
    likeCount: post.likeCount ?? 0,
    username: post.authorUsername ?? post.username ?? '',
    caption: post.caption ?? '',
    hashtags: post.hashtags ?? [],
    span: spanOptions[index % spanOptions.length] ?? 'normal',
  };
}

function ExploreSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-0.5">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className={`bg-[var(--quant-muted)] rounded-lg animate-pulse ${
            i % 5 === 0
              ? 'row-span-2 aspect-[1/2]'
              : i % 7 === 0
                ? 'col-span-2 aspect-[2/1]'
                : 'aspect-square'
          }`}
        />
      ))}
    </div>
  );
}

const ExplorePage: React.FC = () => {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useExplore();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<Category>('For You');

  const posts: ExplorePost[] = useMemo(
    () => (data ?? []).map((p, i) => toExplorePost(p, i)),
    [data],
  );

  const filteredByCategory = useMemo(() => {
    if (activeCategory === 'For You') return posts;
    const needle = activeCategory.toLowerCase();
    return posts.filter(
      (p) =>
        p.caption.toLowerCase().includes(needle) ||
        p.hashtags.some((h) => h.toLowerCase().includes(needle)),
    );
  }, [posts, activeCategory]);

  const filtered = useMemo(() => {
    if (!searchQuery) return filteredByCategory;
    const needle = searchQuery.toLowerCase();
    return filteredByCategory.filter(
      (p) =>
        p.username.toLowerCase().includes(needle) ||
        p.caption.toLowerCase().includes(needle) ||
        p.hashtags.some((h) => h.toLowerCase().includes(needle)),
    );
  }, [filteredByCategory, searchQuery]);

  const handleTagClick = useCallback((tag: string) => {
    setSearchQuery(tag.replace('#', ''));
  }, []);

  if (error) {
    return (
      <PageTransition>
        <div className="min-h-screen bg-white dark:bg-[#0F0F14] flex items-center justify-center px-4">
          <ErrorState message={error.message} onRetry={() => void refetch()} />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="min-h-screen bg-[var(--quant-background)] text-[var(--quant-foreground)]">
        <div className="px-4 max-w-7xl mx-auto py-4">
          {/* Search Bar */}
          <div className="relative mb-4">
            <input
              className="h-11 w-full rounded-xl bg-[var(--quant-card)] border border-[var(--quant-border)] px-4 pl-10 text-sm text-[var(--quant-foreground)] placeholder-[var(--quant-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] transition-shadow"
              placeholder="Search people, tags, captions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search explore"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
              &#128269;
            </span>
            {searchQuery && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                &#10005;
              </button>
            )}
          </div>

          {/* Category Tabs */}
          <div
            className="mb-4 -mx-4 px-4 overflow-x-auto scrollbar-hide"
            role="tablist"
            aria-label="Explore categories"
          >
            <div className="flex gap-2 pb-1">
              {CATEGORIES.map((category) => (
                <button
                  key={category}
                  className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    activeCategory === category
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                  onClick={() => setActiveCategory(category)}
                  role="tab"
                  aria-selected={activeCategory === category}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {/* Trending Hashtags */}
          <div className="mb-4 flex flex-wrap gap-2" aria-label="Trending hashtags">
            {TRENDING_TAGS.map((tag) => (
              <button
                key={tag}
                className="rounded-full border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 px-3 py-1 text-xs font-medium text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors"
                onClick={() => handleTagClick(tag)}
              >
                {tag}
              </button>
            ))}
          </div>

          {/* Content Grid */}
          {isLoading ? (
            <ExploreSkeleton />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="Nothing found"
              description="Try a different search term or category"
            />
          ) : (
            <motion.div
              className="grid grid-cols-3 auto-rows-[150px] gap-0.5"
              initial="hidden"
              animate="visible"
              variants={{
                hidden: { opacity: 0 },
                visible: { opacity: 1, transition: { staggerChildren: 0.03 } },
              }}
            >
              {filtered.map((post) => (
                <motion.button
                  key={post.id}
                  variants={{
                    hidden: { opacity: 0, y: 10 },
                    visible: { opacity: 1, y: 0, transition: { type: 'spring', ...spring.gentle } },
                  }}
                  className={`relative overflow-hidden bg-[var(--quant-muted)] rounded-sm text-left ${
                    post.span === 'tall' ? 'row-span-2' : post.span === 'wide' ? 'col-span-2' : ''
                  }`}
                  onClick={() => router.push(`/post/${post.id}`)}
                  aria-label={`Post by ${post.username}`}
                >
                  {post.thumbnailUrl ? (
                    <img
                      className="w-full h-full object-cover hover:scale-[1.03] transition-transform duration-300"
                      src={post.thumbnailUrl}
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-2xl">
                      &#128247;
                    </div>
                  )}
                  {post.type === 'video' && (
                    <span className="absolute top-2 right-2 text-white drop-shadow-lg text-sm">
                      &#9654;
                    </span>
                  )}
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/50 to-transparent p-2 opacity-0 hover:opacity-100 transition-opacity">
                    <div className="flex items-center gap-1 text-white text-xs">
                      <span>&#10084;</span>
                      <span>{post.likeCount.toLocaleString()}</span>
                    </div>
                  </div>
                </motion.button>
              ))}
            </motion.div>
          )}
        </div>
      </div>
    </PageTransition>
  );
};

export default ExplorePage;
