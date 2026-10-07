// ============================================================================
// QuantNeon - Full-Screen Story Viewer
// Progress bars, tap to advance, swipe to skip user, hold to pause, reply input
// ============================================================================

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import { LoadingState, ErrorState, EmptyState, PageTransition } from '@quant/shared-ui';
import { useStories } from '../hooks/useStories';

interface StorySegment {
  id: string;
  type: 'image' | 'video';
  url: string;
  duration: number;
}

interface StoryUser {
  id: string;
  username: string;
  avatarUrl: string;
  segments: StorySegment[];
  viewerCount: number;
  seenBy: { id: string; avatarUrl: string; username: string }[];
}

const SEGMENT_DURATION = 5000;

const StoryViewerPage: React.FC = () => {
  const { data, isLoading, error, refetch } = useStories();
  const [currentUserIndex, setCurrentUserIndex] = useState(0);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [showViewers, setShowViewers] = useState(false);

  const progressRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  const touchStartX = useRef<number>(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stories: StoryUser[] = ((data as unknown[]) ?? []).map((item: unknown, index: number) => {
    const s = item as Record<string, unknown>;
    return {
      id: (s.id as string) || `story-user-${index}`,
      username: (s.username as string) || `user${index}`,
      avatarUrl: (s.avatarUrl as string) || `https://cdn.quantneon.app/avatars/${index}.jpg`,
      segments: (s.segments as StorySegment[]) || [
        {
          id: `seg-${index}-0`,
          type: 'image',
          url: (s.mediaUrl as string) || '',
          duration: SEGMENT_DURATION,
        },
      ],
      viewerCount: (s.viewerCount as number) || Math.floor(Math.random() * 500) + 50,
      seenBy: (s.seenBy as StoryUser['seenBy']) || [],
    };
  });

  const currentUser = stories[currentUserIndex] || null;
  const currentSegment = currentUser?.segments[currentSegmentIndex] || null;
  const totalSegments = currentUser?.segments.length || 0;

  const advanceSegment = useCallback(() => {
    if (!currentUser) return;
    if (currentSegmentIndex < totalSegments - 1) {
      setCurrentSegmentIndex((prev) => prev + 1);
      setProgress(0);
    } else if (currentUserIndex < stories.length - 1) {
      setCurrentUserIndex((prev) => prev + 1);
      setCurrentSegmentIndex(0);
      setProgress(0);
    }
  }, [currentUser, currentSegmentIndex, totalSegments, currentUserIndex, stories.length]);

  const previousSegment = useCallback(() => {
    if (currentSegmentIndex > 0) {
      setCurrentSegmentIndex((prev) => prev - 1);
      setProgress(0);
    } else if (currentUserIndex > 0) {
      setCurrentUserIndex((prev) => prev - 1);
      setCurrentSegmentIndex(0);
      setProgress(0);
    }
  }, [currentSegmentIndex, currentUserIndex]);

  const skipUser = useCallback(() => {
    if (currentUserIndex < stories.length - 1) {
      setCurrentUserIndex((prev) => prev + 1);
      setCurrentSegmentIndex(0);
      setProgress(0);
    }
  }, [currentUserIndex, stories.length]);

  useEffect(() => {
    if (isPaused || !currentSegment) return;
    startTimeRef.current =
      performance.now() - progress * (currentSegment.duration || SEGMENT_DURATION);

    const animate = (now: number) => {
      const elapsed = now - startTimeRef.current;
      const duration = currentSegment.duration || SEGMENT_DURATION;
      const newProgress = Math.min(elapsed / duration, 1);
      setProgress(newProgress);
      if (newProgress >= 1) {
        advanceSegment();
        return;
      }
      progressRef.current = requestAnimationFrame(animate);
    };
    progressRef.current = requestAnimationFrame(animate);
    return () => {
      if (progressRef.current) cancelAnimationFrame(progressRef.current);
    };
  }, [currentSegment, isPaused, currentSegmentIndex, currentUserIndex, advanceSegment]);

  const handleTap = useCallback(
    (e: React.MouseEvent) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x < rect.width / 3) {
        previousSegment();
      } else {
        advanceSegment();
      }
    },
    [previousSegment, advanceSegment],
  );

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    holdTimerRef.current = setTimeout(() => {
      setIsPaused(true);
      pausedAtRef.current = performance.now();
    }, 200);
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      if (isPaused) {
        setIsPaused(false);
        return;
      }
      const diffX = e.changedTouches[0].clientX - touchStartX.current;
      if (Math.abs(diffX) > 80) {
        if (diffX < 0) skipUser();
        else if (currentUserIndex > 0) {
          setCurrentUserIndex((prev) => prev - 1);
          setCurrentSegmentIndex(0);
          setProgress(0);
        }
      }
    },
    [isPaused, skipUser, currentUserIndex],
  );

  const handleReply = useCallback(() => {
    if (!replyText.trim()) return;
    setReplyText('');
  }, [replyText]);

  if (isLoading) {
    return (
      <PageTransition>
        <div className="h-[100dvh] bg-black flex items-center justify-center">
          <LoadingState variant="spinner" text="Loading stories..." />
        </div>
      </PageTransition>
    );
  }

  if (error) {
    return (
      <PageTransition>
        <div className="h-[100dvh] bg-black flex items-center justify-center">
          <ErrorState message={error.message} onRetry={() => void refetch()} />
        </div>
      </PageTransition>
    );
  }

  if (stories.length === 0) {
    return (
      <PageTransition>
        <div className="h-[100dvh] bg-black flex items-center justify-center">
          <EmptyState title="No stories" description="Follow people to see their stories" />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div
        className="h-[100dvh] bg-black relative overflow-hidden select-none"
        onClick={handleTap}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        role="region"
        aria-label="Story viewer"
      >
        {/* Progress Bars */}
        <div className="absolute top-2 left-2 right-2 z-30 flex gap-1" aria-label="Story progress">
          {Array.from({ length: totalSegments }).map((_, i) => (
            <div
              key={i}
              className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden"
              role="progressbar"
              aria-valuenow={
                i === currentSegmentIndex
                  ? Math.round(progress * 100)
                  : i < currentSegmentIndex
                    ? 100
                    : 0
              }
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full bg-white rounded-full transition-none"
                style={{
                  width: `${i < currentSegmentIndex ? 100 : i === currentSegmentIndex ? progress * 100 : 0}%`,
                }}
              />
            </div>
          ))}
        </div>

        {/* User Info Header */}
        {currentUser && (
          <div className="absolute top-6 left-3 right-3 z-30 flex items-center gap-2">
            <img
              className="w-8 h-8 rounded-full object-cover border border-white/50"
              src={currentUser.avatarUrl}
              alt={currentUser.username}
            />
            <span className="text-white text-sm font-semibold">{currentUser.username}</span>
            <span className="text-white/60 text-xs">{isPaused ? 'Paused' : ''}</span>
          </div>
        )}

        {/* Story Content */}
        <AnimatePresence mode="wait">
          {currentSegment && (
            <motion.div
              key={`${currentUserIndex}-${currentSegmentIndex}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0"
            >
              {currentSegment.type === 'video' ? (
                <video
                  className="w-full h-full object-cover"
                  src={currentSegment.url}
                  autoPlay
                  muted
                  playsInline
                  loop={false}
                />
              ) : (
                <img className="w-full h-full object-cover" src={currentSegment.url} alt="Story" />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Viewer Count */}
        {currentUser && (
          <button
            className="absolute bottom-20 left-3 z-30 flex items-center gap-1.5 text-white/80 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              setShowViewers(!showViewers);
            }}
            aria-label={`${currentUser.viewerCount} viewers`}
          >
            <span>&#128065;</span>
            <span>{currentUser.viewerCount}</span>
          </button>
        )}

        {/* Seen Avatars */}
        {showViewers && currentUser && currentUser.seenBy.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', ...spring.snappy }}
            className="absolute bottom-28 left-3 z-30 flex -space-x-2"
          >
            {currentUser.seenBy.slice(0, 8).map((viewer) => (
              <img
                key={viewer.id}
                className="w-6 h-6 rounded-full border border-black object-cover"
                src={viewer.avatarUrl}
                alt={viewer.username}
                title={viewer.username}
              />
            ))}
            {currentUser.seenBy.length > 8 && (
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-700 text-white text-[10px] border border-black">
                +{currentUser.seenBy.length - 8}
              </span>
            )}
          </motion.div>
        )}

        {/* Reply Input */}
        <div
          className="absolute bottom-4 left-3 right-3 z-30 flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            className="flex-1 h-10 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 px-4 text-sm text-white placeholder-white/50 focus:outline-none focus:border-white/40"
            placeholder="Send a reply..."
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleReply()}
            onFocus={() => setIsPaused(true)}
            onBlur={() => setIsPaused(false)}
            aria-label="Reply to story"
          />
          {replyText.trim() && (
            <motion.button
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', ...spring.bouncy }}
              className="h-10 w-10 rounded-full bg-purple-600 flex items-center justify-center text-white"
              onClick={handleReply}
              aria-label="Send reply"
            >
              &#10148;
            </motion.button>
          )}
        </div>
      </div>
    </PageTransition>
  );
};

export default StoryViewerPage;
