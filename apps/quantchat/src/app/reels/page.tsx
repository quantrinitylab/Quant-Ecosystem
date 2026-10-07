// ============================================================================
// QuantChat - Reels Feed Page (Tasks 3.1, 3.3, 3.5, 3.6)
// Full-screen vertical video feed with swipe gesture handling
// - Swipe up → next reel (300ms vertical slide via Framer Motion + BRAND_SPRINGS.snappy)
// - Swipe down → previous reel (300ms slide)
// - Pre-buffering: preload next 2 reels
// - Infinite scroll: fetch when within 3 items of end
// - Optimistic like with rollback on failure
// ============================================================================
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import { useReelsFeed } from '../../hooks/useReelsFeed';
import { shouldFetchNext } from './feedLogic';
import { ReelPlayer } from './components/ReelPlayer';
import { ReelOverlay } from './components/ReelOverlay';
import { CommentSheet } from './components/CommentSheet';
import { ShareSheet } from './components/ShareSheet';
import { DuetMode } from './components/DuetMode';

// Brand spring tokens for animations
const BRAND_SPRINGS = {
  snappy: { type: 'spring' as const, stiffness: 400, damping: 30 },
};

const SWIPE_THRESHOLD = 50; // px minimum to trigger transition

export default function ReelsPage() {
  const router = useRouter();
  const {
    reels,
    currentIndex,
    setCurrentIndex,
    fetchNextPage,
    hasMore,
    isLoading,
    isFetchingNextPage,
    likeReel,
    unlikeReel,
    shareReel,
    addComment,
  } = useReelsFeed();

  const [direction, setDirection] = useState(0); // -1 = up (next), 1 = down (prev)
  const [commentSheetOpen, setCommentSheetOpen] = useState(false);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  const [duetOpen, setDuetOpen] = useState(false);
  const [activeReelId, setActiveReelId] = useState<string | null>(null);
  const bufferedIndices = useRef<Set<number>>(new Set());

  const currentReel = reels[currentIndex];

  // Task 3.3: Pre-buffering logic - preload next 2 reels
  useEffect(() => {
    const toBuffer = [currentIndex + 1, currentIndex + 2];
    toBuffer.forEach((idx) => {
      if (reels[idx] && !bufferedIndices.current.has(idx)) {
        // Preload video via link[rel=preload]
        const link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'video';
        link.href = reels[idx]!.videoUrl;
        document.head.appendChild(link);
        bufferedIndices.current.add(idx);
      }
    });
  }, [currentIndex, reels]);

  // Task 3.5: Infinite scroll - fetch when within 3 items of end
  useEffect(() => {
    if (shouldFetchNext(currentIndex, reels.length, hasMore) && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [currentIndex, reels.length, hasMore, isFetchingNextPage, fetchNextPage]);

  // Navigate to next reel
  const goToNext = useCallback(() => {
    if (currentIndex < reels.length - 1) {
      setDirection(-1);
      setCurrentIndex(currentIndex + 1);
    }
  }, [currentIndex, reels.length, setCurrentIndex]);

  // Navigate to previous reel
  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      setDirection(1);
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex, setCurrentIndex]);

  // Swipe gesture handler (pointer events)
  const handleDragEnd = useCallback(
    (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const { offset, velocity } = info;
      const swipeY = offset.y;
      const velocityY = velocity.y;

      // Swipe up (negative Y offset) → next reel
      if (swipeY < -SWIPE_THRESHOLD || velocityY < -300) {
        goToNext();
      }
      // Swipe down (positive Y offset) → previous reel
      else if (swipeY > SWIPE_THRESHOLD || velocityY > 300) {
        goToPrev();
      }
    },
    [goToNext, goToPrev],
  );

  // Comment sheet handlers
  const handleOpenComments = useCallback((reelId: string) => {
    setActiveReelId(reelId);
    setCommentSheetOpen(true);
  }, []);

  // Share sheet handlers
  const handleOpenShare = useCallback((reelId: string) => {
    setActiveReelId(reelId);
    setShareSheetOpen(true);
  }, []);

  // Animation variants for vertical slide
  const variants = {
    enter: (dir: number) => ({
      y: dir < 0 ? '100%' : '-100%',
      opacity: 0.8,
    }),
    center: {
      y: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      y: dir < 0 ? '-100%' : '100%',
      opacity: 0.8,
    }),
  };

  // Loading state
  if (isLoading && reels.length === 0) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-black">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/30 border-t-white" />
      </div>
    );
  }

  if (!currentReel) {
    return (
      <div className="flex h-dvh w-full flex-col items-center justify-center gap-4 bg-black">
        <p className="text-gray-400">No reels available</p>
        <button
          type="button"
          onClick={() => router.push('/')}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white transition hover:bg-white/20 active:scale-95"
        >
          Back to chats
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black">
      {/* Back / nav affordance so the immersive feed isn't a dead end */}
      <button
        type="button"
        onClick={() => router.push('/')}
        aria-label="Back to chats"
        className="absolute left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-xl text-white backdrop-blur transition active:scale-95"
      >
        &#8592;
      </button>
      {/* Full-viewport swipeable reel container */}
      <motion.div
        className="h-full w-full touch-none"
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
      >
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={currentReel.id}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              y: BRAND_SPRINGS.snappy,
              opacity: { duration: 0.2 },
            }}
            className="absolute inset-0 h-full w-full"
          >
            {/* Video Player */}
            <ReelPlayer videoUrl={currentReel.videoUrl} isActive={true} />

            {/* Overlay: creator info, actions */}
            <ReelOverlay
              reel={currentReel}
              onLike={likeReel}
              onUnlike={unlikeReel}
              onComment={handleOpenComments}
              onShare={handleOpenShare}
            />
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Loading indicator at bottom during next page fetch */}
      {isFetchingNextPage && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        </div>
      )}

      {/* Comment Bottom Sheet */}
      <CommentSheet
        isOpen={commentSheetOpen}
        onClose={() => setCommentSheetOpen(false)}
        reelId={activeReelId ?? ''}
        commentCount={currentReel.commentCount}
        onAddComment={addComment}
      />

      {/* Share Sheet */}
      <ShareSheet
        isOpen={shareSheetOpen}
        onClose={() => setShareSheetOpen(false)}
        reelId={activeReelId ?? ''}
        caption={currentReel.caption}
        onShare={shareReel}
      />

      {/* Duet Mode */}
      <DuetMode
        originalVideoUrl={currentReel.videoUrl}
        originalCreator={currentReel.creatorUsername}
        isOpen={duetOpen}
        onClose={() => setDuetOpen(false)}
      />
    </div>
  );
}
