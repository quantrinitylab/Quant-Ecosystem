// ============================================================================
// QuantMax - Discover Page
// Trending sounds, hashtag challenges, creator spotlights, category video grids
// with Framer Motion animations and brand theming
// ============================================================================
//
// P0 TRUST FIX (2026-10-06): this public page previously presented fabricated
// data as real — client-generated random view/follower counts and thumbnails
// served from a dead placeholder CDN host. That content is removed. Discover
// content is now loaded ONLY from the backend via discover.service.ts, and when
// no real data exists the page renders honest empty states ("No data yet").
// NEVER reintroduce client-generated metrics or placeholder media URLs here.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { spring } from '@quant/brand';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import {
  fetchDiscoverContent,
  fetchDiscoverCategoryVideos,
  type DiscoverContent,
  type TrendingSound,
  type HashtagChallenge,
  type CreatorSpotlight,
  type DiscoverVideo,
} from '../services/discover.service';

type CategoryTab =
  | 'Comedy'
  | 'Dance'
  | 'Food'
  | 'Sports'
  | 'Fashion'
  | 'Music'
  | 'Gaming'
  | 'Education';

const CATEGORY_TABS: CategoryTab[] = [
  'Comedy',
  'Dance',
  'Food',
  'Sports',
  'Fashion',
  'Music',
  'Gaming',
  'Education',
];

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, ...spring.gentle },
  },
};

/** Honest empty state for a discover section — no fake numbers, no fake media. */
const EmptyState: React.FC<{ title: string; subtitle: string; icon: string }> = ({
  title,
  subtitle,
  icon,
}) => (
  <div className="flex flex-col items-center justify-center rounded-xl bg-[var(--quant-card)] px-6 py-10 text-center">
    <span className="text-3xl" aria-hidden="true">
      {icon}
    </span>
    <p className="mt-3 text-sm font-semibold text-[var(--quant-foreground)]">{title}</p>
    <p className="mt-1 max-w-xs text-xs text-[var(--quant-muted-foreground)]">{subtitle}</p>
  </div>
);

/** Placeholder tile shown when an item has no real media URL (never a fake URL). */
const MediaPlaceholder: React.FC<{ label: string; className?: string }> = ({
  label,
  className = '',
}) => (
  <div
    className={`flex items-center justify-center bg-[var(--surface-elevated)] ${className}`}
    role="img"
    aria-label={label}
  >
    <span className="text-2xl text-[var(--quant-muted-foreground)]" aria-hidden="true">
      {label}
    </span>
  </div>
);

const DiscoverPage: React.FC = () => {
  const [content, setContent] = useState<DiscoverContent>({
    sounds: [],
    challenges: [],
    spotlights: [],
  });
  const [categoryVideos, setCategoryVideos] = useState<DiscoverVideo[]>([]);
  const [activeCategory, setActiveCategory] = useState<CategoryTab>('Comedy');
  const [loading, setLoading] = useState<boolean>(true);
  const [categoryLoading, setCategoryLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showSearchResults, setShowSearchResults] = useState<boolean>(false);
  const [playingSoundId, setPlayingSoundId] = useState<string | null>(null);
  const [spotlightIndex, setSpotlightIndex] = useState<number>(0);

  const { sounds: trendingSounds, challenges, spotlights } = content;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Real backend data only; empty arrays when none exists — never fabricated.
      const data = await fetchDiscoverContent();
      if (!cancelled) {
        setContent(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCategoryLoading(true);
      const videos = await fetchDiscoverCategoryVideos(activeCategory);
      if (!cancelled) {
        setCategoryVideos(videos);
        setCategoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCategory]);

  const handlePlaySound = useCallback((sound: TrendingSound) => {
    // Only real preview URLs can play; items without one do nothing.
    if (!sound.previewUrl) return;
    setPlayingSoundId((prev) => (prev === sound.id ? null : sound.id));
  }, []);

  const handleNextSpotlight = useCallback(() => {
    if (spotlights.length === 0) return;
    setSpotlightIndex((prev) => (prev + 1) % spotlights.length);
  }, [spotlights.length]);

  const handlePrevSpotlight = useCallback(() => {
    if (spotlights.length === 0) return;
    setSpotlightIndex((prev) => (prev === 0 ? spotlights.length - 1 : prev - 1));
  }, [spotlights.length]);

  const formatCount = useCallback((count: number): string => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return String(count);
  }, []);

  const currentSpotlight: CreatorSpotlight | null = useMemo(
    () => spotlights[spotlightIndex] || null,
    [spotlights, spotlightIndex],
  );

  const filteredSounds = useMemo(
    () =>
      trendingSounds
        .filter(
          (s) =>
            s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (s.artistName ?? '').toLowerCase().includes(searchQuery.toLowerCase()),
        )
        .slice(0, 3),
    [trendingSounds, searchQuery],
  );

  const filteredChallenges = useMemo(
    () =>
      challenges
        .filter((c) => c.hashtag.toLowerCase().includes(searchQuery.toLowerCase()))
        .slice(0, 3),
    [challenges, searchQuery],
  );

  if (loading) {
    return <LoadingSkeleton variant="match-list" />;
  }

  return (
    <div className="min-h-screen bg-[var(--quant-background)] pb-20">
      {/* Search Bar */}
      <div className="sticky top-0 z-20 bg-[var(--quant-background)] p-4">
        <input
          className="w-full rounded-xl border border-[var(--quant-border)] bg-[var(--surface-elevated)] px-4 py-3 text-sm text-[var(--quant-foreground)] placeholder-[var(--quant-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-brand-app"
          placeholder="Search sounds, hashtags, creators..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setShowSearchResults(e.target.value.length > 0);
          }}
        />
        {showSearchResults && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', ...spring.stiff }}
            className="absolute inset-x-4 top-full z-30 mt-1 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-3 shadow-lg"
          >
            {filteredSounds.length === 0 && filteredChallenges.length === 0 ? (
              <p className="px-2 py-3 text-center text-sm text-[var(--quant-muted-foreground)]">
                No results found for &ldquo;{searchQuery}&rdquo;
              </p>
            ) : (
              <>
                {filteredSounds.length > 0 && (
                  <div className="mb-2">
                    <h4 className="mb-1 text-xs font-semibold text-[var(--quant-muted-foreground)]">
                      Sounds
                    </h4>
                    {filteredSounds.map((sound) => (
                      <div
                        key={sound.id}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--surface-hover)]"
                      >
                        <span className="text-sm">&#127925;</span>
                        <span className="text-sm text-[var(--quant-foreground)]">
                          {sound.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {filteredChallenges.length > 0 && (
                  <div>
                    <h4 className="mb-1 text-xs font-semibold text-[var(--quant-muted-foreground)]">
                      Hashtags
                    </h4>
                    {filteredChallenges.map((challenge) => (
                      <div
                        key={challenge.id}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--surface-hover)]"
                      >
                        <span className="text-sm text-brand-app">#</span>
                        <span className="text-sm text-[var(--quant-foreground)]">
                          {challenge.hashtag}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </div>

      {/* Trending Sounds */}
      <section className="px-4 pt-2">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--quant-foreground)]">Trending Sounds</h2>
          {trendingSounds.length > 0 && (
            <button className="text-sm font-medium text-brand-app">See All</button>
          )}
        </div>
        {trendingSounds.length === 0 ? (
          <EmptyState
            icon="&#127925;"
            title="No trending sounds yet"
            subtitle="Sounds that creators use in their videos will show up here once they're published."
          />
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="flex gap-3 overflow-x-auto pb-2 scrollbar-none"
          >
            {trendingSounds.map((sound) => (
              <motion.div
                key={sound.id}
                variants={fadeInUp}
                className="flex w-28 shrink-0 flex-col items-center"
              >
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className={`relative h-28 w-28 overflow-hidden rounded-xl ${
                    playingSoundId === sound.id ? 'ring-2 ring-brand-app' : ''
                  }`}
                  onClick={() => handlePlaySound(sound)}
                >
                  {sound.coverUrl ? (
                    <img
                      className="h-full w-full object-cover"
                      src={sound.coverUrl}
                      alt={sound.name}
                    />
                  ) : (
                    <MediaPlaceholder label="&#127925;" className="h-full w-full" />
                  )}
                  {sound.previewUrl && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <span className="text-xl text-white">
                        {playingSoundId === sound.id ? '\u23F8' : '\u25B6'}
                      </span>
                    </div>
                  )}
                </motion.div>
                <span className="mt-1.5 w-full truncate text-center text-xs font-medium text-[var(--quant-foreground)]">
                  {sound.name}
                </span>
                {sound.artistName && (
                  <span className="text-[10px] text-[var(--quant-muted-foreground)]">
                    {sound.artistName}
                  </span>
                )}
                {sound.videoCount !== null && (
                  <span className="text-[10px] text-[var(--quant-muted-foreground)]">
                    {formatCount(sound.videoCount)} videos
                  </span>
                )}
              </motion.div>
            ))}
          </motion.div>
        )}
      </section>

      {/* Challenges */}
      <section className="mt-6 px-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--quant-foreground)]">Challenges</h2>
          {challenges.length > 0 && (
            <button className="text-sm font-medium text-brand-app">See All</button>
          )}
        </div>
        {challenges.length === 0 ? (
          <EmptyState
            icon="&#127942;"
            title="No challenges yet"
            subtitle="New hashtag challenges will appear here when they launch."
          />
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="flex gap-3 overflow-x-auto pb-2 scrollbar-none"
          >
            {challenges.map((challenge) => (
              <motion.div
                key={challenge.id}
                variants={fadeInUp}
                className="relative w-64 shrink-0 overflow-hidden rounded-xl"
              >
                {challenge.bannerUrl ? (
                  <img
                    className="h-36 w-full object-cover"
                    src={challenge.bannerUrl}
                    alt={challenge.title}
                  />
                ) : (
                  <MediaPlaceholder label="&#127942;" className="h-36 w-full" />
                )}
                <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 to-transparent p-3">
                  {challenge.sponsored && (
                    <span className="mb-1 inline-block w-fit rounded-full bg-brand-app/20 px-2 py-0.5 text-[10px] font-medium text-brand-app">
                      Sponsored
                    </span>
                  )}
                  <h3 className="text-sm font-bold text-white">{challenge.hashtag}</h3>
                  <p className="text-xs text-white/80">{challenge.title}</p>
                  {(challenge.videoCount !== null || challenge.participantCount !== null) && (
                    <div className="mt-1 flex gap-2 text-[10px] text-white/70">
                      {challenge.videoCount !== null && (
                        <span>{formatCount(challenge.videoCount)} videos</span>
                      )}
                      {challenge.participantCount !== null && (
                        <span>{formatCount(challenge.participantCount)} creators</span>
                      )}
                    </div>
                  )}
                  {challenge.prizePool && (
                    <span className="mt-1 text-[10px] font-medium text-brand-accent">
                      Prize: {challenge.prizePool}
                    </span>
                  )}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.95 }}
                    className="mt-2 rounded-lg bg-brand-app px-3 py-1.5 text-xs font-medium text-white"
                  >
                    Participate
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </section>

      {/* Creator Spotlights */}
      <section className="mt-6 px-4">
        <h2 className="mb-3 text-lg font-bold text-[var(--quant-foreground)]">
          Creator Spotlights
        </h2>
        {!currentSpotlight ? (
          <EmptyState
            icon="&#11088;"
            title="No creator spotlights yet"
            subtitle="Featured creators will appear here once spotlights are published."
          />
        ) : (
          <>
            <div className="flex items-center gap-3">
              <motion.button
                whileTap={{ scale: 0.9 }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-elevated)] text-[var(--quant-foreground)]"
                onClick={handlePrevSpotlight}
                aria-label="Previous creator"
              >
                &lt;
              </motion.button>
              <motion.div
                key={currentSpotlight.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: 'spring', ...spring.gentle }}
                className="flex flex-1 items-center gap-3 rounded-xl bg-[var(--quant-card)] p-4"
              >
                {currentSpotlight.avatarUrl ? (
                  <img
                    className="h-14 w-14 shrink-0 rounded-full object-cover"
                    src={currentSpotlight.avatarUrl}
                    alt={currentSpotlight.displayName}
                  />
                ) : (
                  <div
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--surface-elevated)] text-lg font-bold text-[var(--quant-muted-foreground)]"
                    aria-label={currentSpotlight.displayName}
                  >
                    {currentSpotlight.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <h3 className="truncate text-sm font-bold text-[var(--quant-foreground)]">
                      {currentSpotlight.displayName}
                    </h3>
                    {currentSpotlight.isVerified && (
                      <span className="text-[var(--quant-info)]">&#10003;</span>
                    )}
                  </div>
                  <span className="text-xs text-[var(--quant-muted-foreground)]">
                    @{currentSpotlight.username}
                  </span>
                  {currentSpotlight.bio && (
                    <p className="mt-0.5 text-xs text-[var(--foreground-secondary)] line-clamp-1">
                      {currentSpotlight.bio}
                    </p>
                  )}
                  {(currentSpotlight.followerCount !== null ||
                    currentSpotlight.videoCount !== null) && (
                    <div className="mt-1 flex gap-3 text-[10px] text-[var(--quant-muted-foreground)]">
                      {currentSpotlight.followerCount !== null && (
                        <span>{formatCount(currentSpotlight.followerCount)} followers</span>
                      )}
                      {currentSpotlight.videoCount !== null && (
                        <span>{currentSpotlight.videoCount} videos</span>
                      )}
                    </div>
                  )}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.95 }}
                    className="mt-2 rounded-lg bg-brand-app px-3 py-1 text-xs font-medium text-white"
                  >
                    Follow
                  </motion.button>
                </div>
              </motion.div>
              <motion.button
                whileTap={{ scale: 0.9 }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-elevated)] text-[var(--quant-foreground)]"
                onClick={handleNextSpotlight}
                aria-label="Next creator"
              >
                &gt;
              </motion.button>
            </div>
            <div className="mt-2 flex justify-center gap-1">
              {spotlights.map((_, idx) => (
                <span
                  key={idx}
                  className={`h-1.5 rounded-full transition-all ${
                    idx === spotlightIndex ? 'w-4 bg-brand-app' : 'w-1.5 bg-[var(--quant-muted)]'
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {/* Category Tabs + Video Grid */}
      <section className="mt-6">
        <div className="flex gap-1 overflow-x-auto px-4 pb-3 scrollbar-none">
          {CATEGORY_TABS.map((tab) => (
            <motion.button
              key={tab}
              whileTap={{ scale: 0.95 }}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-medium transition-colors ${
                activeCategory === tab
                  ? 'bg-brand-app text-white'
                  : 'bg-[var(--surface-elevated)] text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]'
              }`}
              onClick={() => setActiveCategory(tab)}
            >
              {tab}
            </motion.button>
          ))}
        </div>
        {categoryLoading ? (
          <div className="grid grid-cols-2 gap-1 px-1 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div
                key={i}
                className="aspect-[9/16] animate-pulse bg-[var(--surface-elevated)]"
              />
            ))}
          </div>
        ) : categoryVideos.length === 0 ? (
          <div className="px-4">
            <EmptyState
              icon="&#127916;"
              title={`No ${activeCategory.toLowerCase()} videos yet`}
              subtitle="New videos will show up here as creators publish them."
            />
          </div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-2 gap-1 px-1 sm:grid-cols-3 md:grid-cols-4"
          >
            {categoryVideos.map((video) => (
              <motion.div
                key={video.id}
                variants={fadeInUp}
                className="group relative aspect-[9/16] overflow-hidden"
              >
                {video.thumbnailUrl ? (
                  <img
                    className="h-full w-full object-cover"
                    src={video.thumbnailUrl}
                    alt={video.caption ?? 'Video'}
                  />
                ) : (
                  <MediaPlaceholder label="&#127916;" className="h-full w-full" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                {video.viewCount !== null && (
                  <div className="absolute bottom-0 inset-x-0 p-2">
                    <span className="text-[10px] text-white/80">
                      {formatCount(video.viewCount)} views
                    </span>
                  </div>
                )}
                {video.duration !== null && (
                  <div className="absolute right-1 top-1 rounded bg-black/50 px-1 py-0.5 text-[10px] text-white">
                    {video.duration}s
                  </div>
                )}
              </motion.div>
            ))}
          </motion.div>
        )}
      </section>
    </div>
  );
};

export default DiscoverPage;
