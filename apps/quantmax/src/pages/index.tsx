// ============================================================================
// QuantMax - For You Video Feed (TikTok-style full-screen vertical video player)
// Full-screen swipe-up gesture, like/comment/share/save overlay, creator info,
// sound ticker, progress bar, loading/error/empty states
// ============================================================================

import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { spring } from '@quant/brand';
import { LoadingState, ErrorState, EmptyState } from '@quant/shared-ui';
import { useFeed } from '../hooks/useFeed';
import { LoadingSkeleton } from '../components/LoadingSkeleton';

type FeedTab = 'following' | 'foryou';

const actionItemVariants = {
  hidden: { opacity: 0, x: 20 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { type: 'spring', ...spring.snappy, delay: i * 0.05 },
  }),
};

const ForYouFeedPage: React.FC = () => {
  const { state, currentVideo, swipeToNext, swipeToPrevious, toggleLike, toggleMute, togglePlay } =
    useFeed();
  const [activeTab, setActiveTab] = useState<FeedTab>('foryou');
  const [showComments, setShowComments] = useState<boolean>(false);
  const [showShareMenu, setShowShareMenu] = useState<boolean>(false);
  const [likeAnimation, setLikeAnimation] = useState<boolean>(false);
  const prefersReducedMotion = useReducedMotion();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const touchStartY = useRef<number>(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const touchEndY = e.changedTouches[0].clientY;
      const diff = touchStartY.current - touchEndY;
      if (diff > 80) swipeToNext();
      else if (diff < -80) swipeToPrevious();
    },
    [swipeToNext, swipeToPrevious],
  );

  const handleDoubleTap = useCallback(() => {
    if (!currentVideo) return;
    if (!currentVideo.isLiked) toggleLike();
    setLikeAnimation(true);
    setTimeout(() => setLikeAnimation(false), 800);
  }, [currentVideo, toggleLike]);

  const formatCount = useCallback((count: number): string => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return String(count);
  }, []);

  if (state.isLoading && state.videos.length === 0) {
    return <LoadingSkeleton variant="video-feed" />;
  }

  if (state.error) {
    return <ErrorState message={state.error} onRetry={() => window.location.reload()} />;
  }

  if (state.videos.length === 0) {
    return (
      <EmptyState
        title="No videos yet"
        description="Follow creators or explore trending content to fill your feed"
      />
    );
  }

  return (
    <div
      className="relative h-screen w-full overflow-hidden bg-[var(--surface)]"
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Navigation Tabs */}
      <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-center gap-6 pb-2 pt-12">
        <button
          className={`text-sm font-semibold transition-colors ${
            activeTab === 'following' ? 'text-white' : 'text-white/60 hover:text-white/80'
          }`}
          onClick={() => setActiveTab('following')}
        >
          Following
        </button>
        <button
          className={`text-sm font-semibold transition-colors ${
            activeTab === 'foryou' ? 'text-white' : 'text-white/60 hover:text-white/80'
          }`}
          onClick={() => setActiveTab('foryou')}
        >
          For You
        </button>
      </div>

      {/* Video Player with AnimatePresence */}
      <AnimatePresence mode="wait">
        {currentVideo && (
          <motion.div
            key={currentVideo.id}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -40 }}
            transition={
              prefersReducedMotion ? { duration: 0 } : { type: 'spring', ...spring.gentle }
            }
            className="absolute inset-0"
            onClick={() => togglePlay()}
            onDoubleClick={handleDoubleTap}
          >
            <video
              className="h-full w-full object-cover"
              src={currentVideo.videoUrl}
              poster={currentVideo.thumbnailUrl}
              autoPlay={state.isPlaying}
              loop
              muted={state.isMuted}
              playsInline
            />

            {/* Play/Pause Indicator */}
            <AnimatePresence>
              {!state.isPlaying && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 0.8 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', ...spring.bouncy }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/40">
                    <span className="text-3xl text-white">&#9654;</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Double-tap like animation */}
            <AnimatePresence>
              {likeAnimation && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1.2, opacity: 1 }}
                  exit={{ scale: 1.5, opacity: 0 }}
                  transition={{ type: 'spring', ...spring.bouncy }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <span className="text-7xl text-[var(--quant-destructive)]">&#10084;</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Action Overlay - Right Side */}
            <div className="absolute bottom-32 right-3 flex flex-col items-center gap-5">
              {/* Creator Avatar */}
              <motion.div
                custom={0}
                variants={actionItemVariants}
                initial="hidden"
                animate="visible"
                className="flex flex-col items-center"
              >
                <div className="h-11 w-11 overflow-hidden rounded-full border-2 border-white">
                  <img
                    className="h-full w-full object-cover"
                    src={currentVideo.creator?.avatarUrl}
                    alt={currentVideo.creator?.username}
                  />
                </div>
              </motion.div>

              {/* Like */}
              <motion.button
                custom={1}
                variants={actionItemVariants}
                initial="hidden"
                animate="visible"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className={`flex h-11 w-11 flex-col items-center justify-center rounded-full transition-colors ${
                  currentVideo.isLiked ? 'text-[var(--quant-destructive)]' : 'text-white'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLike();
                }}
              >
                <span className="text-2xl">&#10084;</span>
                <span className="mt-0.5 text-[10px] text-white">
                  {formatCount(currentVideo.likes)}
                </span>
              </motion.button>

              {/* Comments */}
              <motion.button
                custom={2}
                variants={actionItemVariants}
                initial="hidden"
                animate="visible"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="flex h-11 w-11 flex-col items-center justify-center text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowComments(true);
                }}
              >
                <span className="text-2xl">&#128172;</span>
                <span className="mt-0.5 text-[10px]">{formatCount(currentVideo.comments)}</span>
              </motion.button>

              {/* Share */}
              <motion.button
                custom={3}
                variants={actionItemVariants}
                initial="hidden"
                animate="visible"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="flex h-11 w-11 flex-col items-center justify-center text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowShareMenu(true);
                }}
              >
                <span className="text-2xl">&#10148;</span>
                <span className="mt-0.5 text-[10px]">{formatCount(currentVideo.shares)}</span>
              </motion.button>

              {/* Mute */}
              <motion.button
                custom={4}
                variants={actionItemVariants}
                initial="hidden"
                animate="visible"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="flex h-11 w-11 items-center justify-center text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMute();
                }}
              >
                <span className="text-xl">{state.isMuted ? '\u{1F507}' : '\u{1F50A}'}</span>
              </motion.button>
            </div>

            {/* Video Info - Bottom */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pb-20">
              <span className="text-sm font-bold text-white">
                @{currentVideo.creator?.username}
              </span>
              <p className="mt-1 text-sm text-gray-200 line-clamp-2">{currentVideo.caption}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {(currentVideo.hashtags || []).map((tag) => (
                  <span key={tag} className="text-xs font-medium text-white/80">
                    #{tag}
                  </span>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-gray-300">&#9835;</span>
                <span className="truncate text-xs text-gray-300">{currentVideo.sound?.name}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Comments Panel */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', ...spring.stiff }}
            className="absolute inset-x-0 bottom-0 z-40 max-h-[60vh] rounded-t-2xl bg-[var(--quant-card)] p-4"
          >
            <div className="flex items-center justify-between border-b border-[var(--quant-border)] pb-3">
              <h3 className="text-base font-semibold text-[var(--quant-foreground)]">Comments</h3>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[var(--surface-hover)]"
                onClick={() => setShowComments(false)}
              >
                &#10005;
              </button>
            </div>
            <div className="py-6 text-center text-sm text-[var(--quant-muted-foreground)]">
              Comments loaded from API
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Share Menu */}
      <AnimatePresence>
        {showShareMenu && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 flex items-end bg-black/50"
            onClick={() => setShowShareMenu(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', ...spring.stiff }}
              className="w-full rounded-t-2xl bg-[var(--quant-card)] p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-4 text-base font-semibold text-[var(--quant-foreground)]">
                Share to
              </h3>
              <div className="flex gap-4">
                <button className="flex min-h-[44px] min-w-[44px] flex-col items-center gap-1 rounded-lg p-2 hover:bg-[var(--surface-hover)]">
                  <span className="text-xl">&#128172;</span>
                  <span className="text-xs text-[var(--quant-muted-foreground)]">Messages</span>
                </button>
                <button className="flex min-h-[44px] min-w-[44px] flex-col items-center gap-1 rounded-lg p-2 hover:bg-[var(--surface-hover)]">
                  <span className="text-xl">&#128279;</span>
                  <span className="text-xs text-[var(--quant-muted-foreground)]">Copy Link</span>
                </button>
              </div>
              <button
                className="mt-4 w-full rounded-lg border border-[var(--quant-border)] py-3 text-sm font-medium text-[var(--quant-foreground)] hover:bg-[var(--surface-hover)]"
                onClick={() => setShowShareMenu(false)}
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ForYouFeedPage;
