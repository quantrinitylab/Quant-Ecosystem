// ============================================================================
// QuantMax - Discover Page
// Trending sounds, hashtag challenges, creator spotlights, category video grids
// with Framer Motion animations and brand theming
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { spring } from '@quant/brand';
import { LoadingSkeleton } from '../components/LoadingSkeleton';

interface TrendingSound {
  id: string;
  name: string;
  artistName: string;
  coverUrl: string;
  videoCount: number;
  previewUrl: string;
  duration: number;
  isPlaying: boolean;
}

interface HashtagChallenge {
  id: string;
  hashtag: string;
  title: string;
  description: string;
  bannerUrl: string;
  videoCount: number;
  participantCount: number;
  prizePool: string | null;
  endsAt: string;
  sponsored: boolean;
}

interface CreatorSpotlight {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  followerCount: number;
  videoCount: number;
  isVerified: boolean;
  category: string;
}

interface DiscoverVideo {
  id: string;
  thumbnailUrl: string;
  viewCount: number;
  likes: number;
  creatorUsername: string;
  caption: string;
  duration: number;
}

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

const DiscoverPage: React.FC = () => {
  const [trendingSounds, setTrendingSounds] = useState<TrendingSound[]>([]);
  const [challenges, setChallenges] = useState<HashtagChallenge[]>([]);
  const [spotlights, setSpotlights] = useState<CreatorSpotlight[]>([]);
  const [categoryVideos, setCategoryVideos] = useState<DiscoverVideo[]>([]);
  const [activeCategory, setActiveCategory] = useState<CategoryTab>('Comedy');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showSearchResults, setShowSearchResults] = useState<boolean>(false);
  const [playingSoundId, setPlayingSoundId] = useState<string | null>(null);
  const [spotlightIndex, setSpotlightIndex] = useState<number>(0);

  useEffect(() => {
    loadDiscoverData();
  }, []);

  useEffect(() => {
    loadCategoryVideos(activeCategory);
  }, [activeCategory]);

  const loadDiscoverData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));

      const sounds: TrendingSound[] = Array.from({ length: 12 }, (_, i) => ({
        id: `sound-${i}`,
        name: `Trending Track ${i + 1}`,
        artistName: `Artist ${i + 1}`,
        coverUrl: `https://cdn.quantmax.app/sounds/covers/${i}.jpg`,
        videoCount: Math.floor(Math.random() * 500000) + 10000,
        previewUrl: `https://cdn.quantmax.app/sounds/preview/${i}.mp3`,
        duration: 15 + Math.floor(Math.random() * 30),
        isPlaying: false,
      }));
      setTrendingSounds(sounds);

      const chals: HashtagChallenge[] = Array.from({ length: 6 }, (_, i) => ({
        id: `challenge-${i}`,
        hashtag: `#${['DanceChallenge', 'FunnyFaces', 'CookWithMe', 'FitnessGoals', 'OOTDCheck', 'DuetThis'][i]}`,
        title: [
          'Show Your Moves',
          'Make Us Laugh',
          'Cook Something New',
          'Push Your Limits',
          'Style Challenge',
          'Duet Time',
        ][i],
        description: `Join the ${['dance', 'comedy', 'cooking', 'fitness', 'fashion', 'duet'][i]} challenge!`,
        bannerUrl: `https://cdn.quantmax.app/challenges/banners/${i}.jpg`,
        videoCount: Math.floor(Math.random() * 1000000) + 50000,
        participantCount: Math.floor(Math.random() * 100000) + 5000,
        prizePool: i % 2 === 0 ? `$${(i + 1) * 1000}` : null,
        endsAt: `${Math.floor(Math.random() * 7) + 1} days`,
        sponsored: i % 3 === 0,
      }));
      setChallenges(chals);

      const creators: CreatorSpotlight[] = Array.from({ length: 8 }, (_, i) => ({
        id: `creator-${i}`,
        username: `creator_${i}`,
        displayName: `Creative Star ${i + 1}`,
        avatarUrl: `https://cdn.quantmax.app/creators/${i}.jpg`,
        bio: `Content creator specializing in ${CATEGORY_TABS[i % CATEGORY_TABS.length]}`,
        followerCount: Math.floor(Math.random() * 5000000) + 100000,
        videoCount: Math.floor(Math.random() * 500) + 50,
        isVerified: i < 5,
        category: CATEGORY_TABS[i % CATEGORY_TABS.length],
      }));
      setSpotlights(creators);
    } catch {
      setError('Failed to load discover content');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCategoryVideos = useCallback(async (category: CategoryTab) => {
    const videos: DiscoverVideo[] = Array.from({ length: 12 }, (_, i) => ({
      id: `${category}-video-${i}`,
      thumbnailUrl: `https://cdn.quantmax.app/discover/${category.toLowerCase()}/${i}.jpg`,
      viewCount: Math.floor(Math.random() * 2000000) + 10000,
      likes: Math.floor(Math.random() * 500000) + 1000,
      creatorUsername: `creator_${i}`,
      caption: `Amazing ${category.toLowerCase()} content #${category.toLowerCase()}`,
      duration: 15 + Math.floor(Math.random() * 45),
    }));
    setCategoryVideos(videos);
  }, []);

  const handlePlaySound = useCallback((soundId: string) => {
    setPlayingSoundId((prev) => (prev === soundId ? null : soundId));
  }, []);

  const handleNextSpotlight = useCallback(() => {
    setSpotlightIndex((prev) => (prev + 1) % spotlights.length);
  }, [spotlights.length]);

  const handlePrevSpotlight = useCallback(() => {
    setSpotlightIndex((prev) => (prev === 0 ? spotlights.length - 1 : prev - 1));
  }, [spotlights.length]);

  const formatCount = useCallback((count: number): string => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return String(count);
  }, []);

  const currentSpotlight = useMemo(
    () => spotlights[spotlightIndex] || null,
    [spotlights, spotlightIndex],
  );

  if (loading) {
    return <LoadingSkeleton variant="match-list" />;
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--quant-background)] px-6">
        <p className="text-sm text-[var(--quant-destructive)]">{error}</p>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          className="mt-4 rounded-lg bg-brand-app px-6 py-2.5 text-sm font-medium text-white"
          onClick={loadDiscoverData}
        >
          Retry
        </motion.button>
      </div>
    );
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
            <div className="mb-2">
              <h4 className="mb-1 text-xs font-semibold text-[var(--quant-muted-foreground)]">
                Sounds
              </h4>
              {trendingSounds
                .filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .slice(0, 3)
                .map((sound) => (
                  <div
                    key={sound.id}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--surface-hover)]"
                  >
                    <span className="text-sm">&#127925;</span>
                    <span className="text-sm text-[var(--quant-foreground)]">{sound.name}</span>
                  </div>
                ))}
            </div>
            <div>
              <h4 className="mb-1 text-xs font-semibold text-[var(--quant-muted-foreground)]">
                Hashtags
              </h4>
              {challenges
                .filter((c) => c.hashtag.toLowerCase().includes(searchQuery.toLowerCase()))
                .slice(0, 3)
                .map((challenge) => (
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
          </motion.div>
        )}
      </div>

      {/* Trending Sounds */}
      <section className="px-4 pt-2">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--quant-foreground)]">Trending Sounds</h2>
          <button className="text-sm font-medium text-brand-app">See All</button>
        </div>
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
                onClick={() => handlePlaySound(sound.id)}
              >
                <img className="h-full w-full object-cover" src={sound.coverUrl} alt={sound.name} />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <span className="text-xl text-white">
                    {playingSoundId === sound.id ? '\u23F8' : '\u25B6'}
                  </span>
                </div>
              </motion.div>
              <span className="mt-1.5 w-full truncate text-center text-xs font-medium text-[var(--quant-foreground)]">
                {sound.name}
              </span>
              <span className="text-[10px] text-[var(--quant-muted-foreground)]">
                {sound.artistName}
              </span>
              <span className="text-[10px] text-[var(--quant-muted-foreground)]">
                {formatCount(sound.videoCount)} videos
              </span>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Challenges */}
      <section className="mt-6 px-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--quant-foreground)]">Challenges</h2>
          <button className="text-sm font-medium text-brand-app">See All</button>
        </div>
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
              <img
                className="h-36 w-full object-cover"
                src={challenge.bannerUrl}
                alt={challenge.title}
              />
              <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/80 to-transparent p-3">
                {challenge.sponsored && (
                  <span className="mb-1 inline-block w-fit rounded-full bg-brand-app/20 px-2 py-0.5 text-[10px] font-medium text-brand-app">
                    Sponsored
                  </span>
                )}
                <h3 className="text-sm font-bold text-white">{challenge.hashtag}</h3>
                <p className="text-xs text-white/80">{challenge.title}</p>
                <div className="mt-1 flex gap-2 text-[10px] text-white/70">
                  <span>{formatCount(challenge.videoCount)} videos</span>
                  <span>{formatCount(challenge.participantCount)} creators</span>
                </div>
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
      </section>

      {/* Creator Spotlights */}
      <section className="mt-6 px-4">
        <h2 className="mb-3 text-lg font-bold text-[var(--quant-foreground)]">
          Creator Spotlights
        </h2>
        {currentSpotlight && (
          <div className="flex items-center gap-3">
            <motion.button
              whileTap={{ scale: 0.9 }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-elevated)] text-[var(--quant-foreground)]"
              onClick={handlePrevSpotlight}
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
              <img
                className="h-14 w-14 shrink-0 rounded-full object-cover"
                src={currentSpotlight.avatarUrl}
                alt={currentSpotlight.displayName}
              />
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
                <p className="mt-0.5 text-xs text-[var(--foreground-secondary)] line-clamp-1">
                  {currentSpotlight.bio}
                </p>
                <div className="mt-1 flex gap-3 text-[10px] text-[var(--quant-muted-foreground)]">
                  <span>{formatCount(currentSpotlight.followerCount)} followers</span>
                  <span>{currentSpotlight.videoCount} videos</span>
                </div>
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
            >
              &gt;
            </motion.button>
          </div>
        )}
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
              <img
                className="h-full w-full object-cover"
                src={video.thumbnailUrl}
                alt={video.caption}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="absolute bottom-0 inset-x-0 p-2">
                <span className="text-[10px] text-white/80">
                  {formatCount(video.viewCount)} views
                </span>
              </div>
              <div className="absolute right-1 top-1 rounded bg-black/50 px-1 py-0.5 text-[10px] text-white">
                {video.duration}s
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>
    </div>
  );
};

export default DiscoverPage;
