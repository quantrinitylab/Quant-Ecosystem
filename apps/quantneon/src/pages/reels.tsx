// ============================================================================
// QuantNeon - Reels Feed (Full-Screen Vertical Scroll)
// 100vh per reel, sound toggle, right sidebar actions, bottom overlay
// ============================================================================

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import {
  LoadingState,
  ErrorState,
  EmptyState,
  SpringButton,
  PageTransition,
} from '@quant/shared-ui';
import { useReels } from '../hooks/useReels';
import { useAuth } from '../providers/auth-provider';
import { GuestInteractionGate } from '../components/GuestInteractionGate';
import { apiClient } from '../services/api-client';
import { classifyVerticalSwipe, isDoubleTap, type GesturePoint } from '../features/reels/gesture';

interface ReelCommentItem {
  id: string;
  username: string;
  userAvatar: string | null;
  content: string;
}

interface HeartBurst {
  id: number;
  reelId: string;
  x: number;
  y: number;
}

function isInteractiveGestureTarget(target: EventTarget | null): boolean {
  return (
    typeof Element !== 'undefined' &&
    target instanceof Element &&
    target.closest(
      'button, a, input, textarea, select, [role="textbox"], [data-reel-gesture-ignore]',
    ) !== null
  );
}

const ReelsPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [state, actions] = useReels();
  const [showCaption, setShowCaption] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showSoundInfo, setShowSoundInfo] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<ReelCommentItem[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [heartBursts, setHeartBursts] = useState<HeartBurst[]>([]);
  const [slideDirection, setSlideDirection] = useState(1);
  const [guestGateOpen, setGuestGateOpen] = useState(false);
  const [guestGateAction, setGuestGateAction] = useState<string>('interact');

  const requireAuth = useCallback(
    (action: string, callback: () => void) => {
      if (!isAuthenticated) {
        setGuestGateAction(action);
        setGuestGateOpen(true);
        return;
      }
      callback();
    },
    [isAuthenticated],
  );

  const touchStart = useRef<GesturePoint | null>(null);
  const lastTap = useRef<GesturePoint | null>(null);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartBurstTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const nextHeartBurstId = useRef(0);
  const ignoreClickUntil = useRef(0);
  const currentReel = state.reels[state.currentIndex] || null;

  const navigateAdjacent = useCallback(
    (direction: 'next' | 'previous') => {
      setSlideDirection(direction === 'next' ? 1 : -1);
      if (direction === 'next') actions.next();
      else actions.previous();
    },
    [actions],
  );

  const loadComments = useCallback(async (reelId: string) => {
    setLoadingComments(true);
    try {
      const response = await apiClient.getReelComments(reelId);
      if (response.success && response.data?.comments) {
        setComments(response.data.comments as unknown as ReelCommentItem[]);
      }
    } finally {
      setLoadingComments(false);
    }
  }, []);

  useEffect(() => {
    if (showComments && currentReel) {
      void loadComments(currentReel.id);
    }
  }, [showComments, currentReel?.id]);

  const submitComment = useCallback(async () => {
    const text = commentText.trim();
    if (!text || !currentReel) return;
    if (!isAuthenticated) {
      setGuestGateAction('comment');
      setGuestGateOpen(true);
      return;
    }
    await actions.comment(currentReel.id, text);
    setCommentText('');
    await loadComments(currentReel.id);
  }, [commentText, currentReel, actions, loadComments, isAuthenticated]);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    touchStart.current = null;
    if (isInteractiveGestureTarget(e.target)) return;

    const touch = e.touches[0];
    if (!touch) return;
    touchStart.current = {
      x: touch.clientX,
      y: touch.clientY,
      at: Date.now(),
    };
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const start = touchStart.current;
      touchStart.current = null;
      const touch = e.changedTouches[0];
      if (!start || !touch || isInteractiveGestureTarget(e.target)) return;

      const direction = classifyVerticalSwipe(
        start,
        { x: touch.clientX, y: touch.clientY, at: Date.now() },
        typeof window === 'undefined' ? 800 : window.innerHeight,
      );
      if (!direction) return;

      // The following synthesized click belongs to the swipe, not a playback tap.
      ignoreClickUntil.current = Date.now() + 400;
      lastTap.current = null;
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      navigateAdjacent(direction);
    },
    [navigateAdjacent],
  );

  const handlePlayerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (
        !currentReel ||
        isInteractiveGestureTarget(e.target) ||
        Date.now() < ignoreClickUntil.current
      ) {
        return;
      }

      const point: GesturePoint = {
        x: e.clientX,
        y: e.clientY,
        at: Date.now(),
      };
      if (isDoubleTap(lastTap.current, point)) {
        lastTap.current = null;
        if (singleTapTimer.current) {
          clearTimeout(singleTapTimer.current);
          singleTapTimer.current = null;
        }

        if (!isAuthenticated) {
          setGuestGateAction('like');
          setGuestGateOpen(true);
          return;
        }

        // Double-tap is an idempotent like gesture: it never toggles an existing like off.
        if (!state.liked.has(currentReel.id)) actions.like(currentReel.id);

        const bounds = e.currentTarget.getBoundingClientRect();
        const id = ++nextHeartBurstId.current;
        const burst: HeartBurst = {
          id,
          reelId: currentReel.id,
          x: point.x - bounds.left - 40,
          y: point.y - bounds.top - 46,
        };
        setHeartBursts((bursts) => [...bursts, burst].slice(-3));
        const timer = setTimeout(() => {
          heartBurstTimers.current.delete(id);
          setHeartBursts((bursts) => bursts.filter((item) => item.id !== id));
        }, 850);
        heartBurstTimers.current.set(id, timer);
        return;
      }

      // A fast second tap at a different spot is two ordinary taps, not a heart burst.
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
        lastTap.current = null;
        actions.togglePlay();
      }

      lastTap.current = point;
      const reelId = currentReel.id;
      singleTapTimer.current = setTimeout(() => {
        singleTapTimer.current = null;
        lastTap.current = null;
        if (state.reels[state.currentIndex]?.id === reelId) actions.togglePlay();
      }, 280);
    },
    [actions, currentReel, state.currentIndex, state.liked, state.reels, isAuthenticated],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (isInteractiveGestureTarget(e.target)) return;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        navigateAdjacent('next');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        navigateAdjacent('previous');
      }
    },
    [navigateAdjacent],
  );

  useEffect(
    () => () => {
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
      for (const timer of heartBurstTimers.current.values()) clearTimeout(timer);
      heartBurstTimers.current.clear();
    },
    [],
  );

  useEffect(() => {
    lastTap.current = null;
    if (singleTapTimer.current) {
      clearTimeout(singleTapTimer.current);
      singleTapTimer.current = null;
    }
    setShowCaption(false);
    setShowSoundInfo(false);
    setHeartBursts((bursts) => bursts.filter((burst) => burst.reelId === currentReel?.id));
  }, [currentReel?.id]);

  const formatCount = useCallback((count: number): string => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return String(count);
  }, []);

  if (state.loading && state.reels.length === 0) {
    return (
      <PageTransition>
        <div className="h-[100dvh] bg-black flex items-center justify-center">
          <LoadingState variant="spinner" text="Loading reels..." />
        </div>
      </PageTransition>
    );
  }

  if (state.error && state.reels.length === 0) {
    return (
      <PageTransition>
        <div className="h-[100dvh] bg-black flex items-center justify-center">
          <ErrorState message={state.error} onRetry={() => void actions.loadMore()} />
        </div>
      </PageTransition>
    );
  }

  if (state.reels.length === 0) {
    return (
      <PageTransition>
        <div className="h-[100dvh] bg-black flex items-center justify-center">
          <EmptyState title="No reels" description="Check back later for new reels" />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div
        className="h-[100dvh] bg-black text-white relative overflow-hidden"
        onKeyDown={handleKeyDown}
        role="region"
        aria-label="Reels feed"
        tabIndex={0}
      >
        {/* Sound Toggle - Top Right */}
        <div className="pointer-events-none absolute inset-x-0 top-4 z-30 mx-auto flex w-full max-w-[56.25dvh] justify-end px-4">
          <SpringButton
            className="pointer-events-auto min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-black/30 backdrop-blur-sm"
            onClick={() => actions.toggleMute()}
            aria-label={state.isMuted ? 'Unmute' : 'Mute'}
          >
            <span className="text-lg">{state.isMuted ? '\u{1F507}' : '\u{1F50A}'}</span>
          </SpringButton>
        </div>

        <AnimatePresence mode="wait" custom={slideDirection}>
          {currentReel && (
            <motion.div
              key={currentReel.id}
              custom={slideDirection}
              variants={{
                enter: (direction: number) => ({
                  y: direction > 0 ? '100%' : '-100%',
                  opacity: 0.8,
                }),
                center: { y: 0, opacity: 1 },
                exit: (direction: number) => ({
                  y: direction > 0 ? '-100%' : '100%',
                  opacity: 0.8,
                }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="absolute inset-0 mx-auto w-full max-w-[56.25dvh] overflow-hidden touch-none"
              onClick={handlePlayerClick}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              role="group"
              aria-roledescription="reel"
              aria-label={`Reel ${state.currentIndex + 1} of ${state.reels.length}`}
            >
              <video
                className="absolute inset-0 w-full h-full object-cover"
                src={currentReel.videoUrl}
                poster={currentReel.thumbnailUrl}
                autoPlay={state.isPlaying}
                loop
                muted={state.isMuted}
                playsInline
                aria-label={`Video by ${currentReel.creator}`}
              />

              {/* Double-tap heart feedback is visual only; the like request remains explicit. */}
              <AnimatePresence>
                {heartBursts
                  .filter((burst) => burst.reelId === currentReel.id)
                  .map((burst) => (
                    <motion.span
                      key={burst.id}
                      className="pointer-events-none absolute z-30 w-20 select-none text-center text-7xl leading-none text-rose-500 drop-shadow-lg"
                      style={{ left: burst.x, top: burst.y }}
                      initial={{ scale: 0.25, opacity: 0 }}
                      animate={{
                        scale: [0.25, 1.35, 1],
                        y: [0, -12, -34],
                        opacity: [0, 1, 0.95],
                      }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      transition={{ duration: 0.72, ease: 'easeOut' }}
                      aria-hidden="true"
                    >
                      ♥
                    </motion.span>
                  ))}
              </AnimatePresence>

              {/* Pause Indicator */}
              {!state.isPlaying && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute inset-0 flex items-center justify-center bg-black/20"
                >
                  <span className="text-5xl">&#9654;</span>
                </motion.div>
              )}

              {/* Right Sidebar Actions */}
              <div
                className="absolute right-3 bottom-32 flex flex-col items-center gap-5"
                aria-label="Reel actions"
              >
                {/* Like */}
                <SpringButton
                  className={`min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-1 ${state.liked.has(currentReel.id) ? 'text-red-500' : 'text-white'}`}
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    requireAuth('like', () => {
                      state.liked.has(currentReel.id)
                        ? actions.unlike(currentReel.id)
                        : actions.like(currentReel.id);
                    });
                  }}
                  aria-label={`Like, ${formatCount(currentReel.likeCount)}`}
                  aria-pressed={state.liked.has(currentReel.id)}
                >
                  <motion.span
                    className="text-2xl"
                    animate={state.liked.has(currentReel.id) ? { scale: [1, 1.4, 1] } : {}}
                    transition={{ duration: 0.3 }}
                  >
                    {state.liked.has(currentReel.id) ? '\u2764' : '\u2661'}
                  </motion.span>
                  <span className="text-xs">{formatCount(currentReel.likeCount)}</span>
                </SpringButton>

                {/* Comment */}
                <SpringButton
                  className="min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-1 text-white"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    requireAuth('comment', () => {
                      setShowComments(true);
                    });
                  }}
                  aria-label={`Comments, ${formatCount(currentReel.commentCount)}`}
                >
                  <span className="text-2xl">&#128172;</span>
                  <span className="text-xs">{formatCount(currentReel.commentCount)}</span>
                </SpringButton>

                {/* Share */}
                <SpringButton
                  className="min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-1 text-white"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    actions.share(currentReel.id);
                  }}
                  aria-label={`Share, ${formatCount(currentReel.shareCount)}`}
                >
                  <span className="text-2xl">&#10148;</span>
                  <span className="text-xs">{formatCount(currentReel.shareCount)}</span>
                </SpringButton>

                {/* Bookmark */}
                <SpringButton
                  className={`min-w-[44px] min-h-[44px] flex flex-col items-center justify-center gap-1 ${isBookmarked ? 'text-yellow-400' : 'text-white'}`}
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    requireAuth('bookmark', () => {
                      setIsBookmarked(!isBookmarked);
                    });
                  }}
                  aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
                  aria-pressed={isBookmarked}
                >
                  <span className="text-2xl">{isBookmarked ? '\u{1F516}' : '\u{1F3F7}'}</span>
                </SpringButton>

                {/* Sound Info */}
                <SpringButton
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    setShowSoundInfo(!showSoundInfo);
                  }}
                  aria-label="Sound info"
                >
                  <motion.div
                    animate={{ rotate: state.isPlaying ? 360 : 0 }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: 'linear',
                    }}
                    className="w-8 h-8 rounded-full border-2 border-white/50 bg-black/40 flex items-center justify-center overflow-hidden"
                  >
                    <span className="text-xs">&#127925;</span>
                  </motion.div>
                </SpringButton>
              </div>

              {/* Bottom Overlay - Creator Info */}
              <div className="absolute bottom-4 left-3 right-16" aria-label="Creator information">
                {/* Creator */}
                <div className="flex items-center gap-2 mb-2">
                  <img
                    className="w-9 h-9 rounded-full object-cover border border-white/30"
                    src={currentReel.creatorAvatar}
                    alt={currentReel.creator}
                  />
                  <span className="font-semibold text-sm">@{currentReel.creator}</span>
                  <button
                    className="ml-2 px-3 py-1 rounded border border-white/60 text-xs font-medium"
                    onClick={(e) => {
                      e.stopPropagation();
                      requireAuth('follow', () => {});
                    }}
                    aria-label="Follow creator"
                  >
                    Follow
                  </button>
                </div>

                {/* Caption */}
                <div className="mb-2">
                  <p
                    className={`text-sm leading-snug ${!showCaption ? 'line-clamp-2' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowCaption(!showCaption);
                    }}
                  >
                    {currentReel.caption}
                  </p>
                  {currentReel.caption && currentReel.caption.length > 80 && !showCaption && (
                    <button
                      className="text-xs text-white/70 mt-0.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowCaption(true);
                      }}
                    >
                      See more
                    </button>
                  )}
                </div>

                {/* Original Sound Badge */}
                <div className="flex items-center gap-2">
                  <span className="text-xs">&#127925;</span>
                  <div className="overflow-hidden max-w-[200px]">
                    <motion.span
                      className="text-xs whitespace-nowrap inline-block"
                      animate={{ x: state.isPlaying ? [0, -100] : 0 }}
                      transition={{
                        duration: 5,
                        repeat: Infinity,
                        ease: 'linear',
                      }}
                    >
                      {currentReel.soundName || 'Original Sound'}
                    </motion.span>
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/20">
                <motion.div
                  className="h-full bg-white"
                  style={{ width: `${state.progress}%` }}
                  transition={{ duration: 0.1 }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sound Info Popover */}
        <AnimatePresence>
          {showSoundInfo && currentReel && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ type: 'spring', ...spring.snappy }}
              className="absolute bottom-24 right-3 z-40 rounded-xl bg-black/80 backdrop-blur-md p-3 max-w-[200px]"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-xs font-medium">{currentReel.soundName || 'Original Sound'}</p>
              <p className="text-[10px] text-white/60 mt-0.5">by @{currentReel.creator}</p>
              <button className="mt-2 w-full text-[10px] font-medium bg-white/20 rounded-md py-1.5">
                Use this sound
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Comments Sheet */}
        <AnimatePresence>
          {showComments && currentReel && (
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', ...spring.snappy }}
              className="absolute bottom-0 left-0 right-0 z-50 max-h-[70vh] rounded-t-2xl bg-[#1a1a1f] p-4 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold">Comments</h2>
                <button
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-white/70"
                  onClick={() => setShowComments(false)}
                  aria-label="Close comments"
                >
                  &#10005;
                </button>
              </div>

              <div
                className="flex-1 overflow-y-auto space-y-3"
                role="list"
                aria-label="Reel comments"
              >
                {loadingComments ? (
                  <p className="text-xs text-white/50">Loading...</p>
                ) : comments.length === 0 ? (
                  <p className="text-xs text-white/50">No comments yet. Be the first!</p>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="flex gap-2.5" role="listitem">
                      <img
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                        src={c.userAvatar ?? ''}
                        alt={c.username}
                      />
                      <p className="text-sm">
                        <strong className="mr-1">{c.username}</strong>
                        {c.content}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center gap-2 pt-3 mt-2 border-t border-white/10">
                <input
                  className="flex-1 text-sm bg-white/10 rounded-full px-4 py-2 placeholder-white/40 focus:outline-none"
                  placeholder="Add a comment..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void submitComment()}
                  aria-label="Add reel comment"
                />
                {commentText.trim() && (
                  <button
                    className="text-sm font-semibold text-purple-400"
                    onClick={() => void submitComment()}
                  >
                    Post
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Guest Interaction Gate Modal */}
        <GuestInteractionGate
          isOpen={guestGateOpen}
          onClose={() => setGuestGateOpen(false)}
          action={guestGateAction}
        />
      </div>
    </PageTransition>
  );
};

export default ReelsPage;
