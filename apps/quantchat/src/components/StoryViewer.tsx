'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { spring } from '@quant/brand';

interface Story {
  id: string;
  authorName: string;
  type: 'photo' | 'video' | 'text';
  mediaUrl?: string;
  text?: string;
  duration: number;
  createdAt: string;
}

interface StoryViewerProps {
  stories: Story[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  autoAdvance?: boolean;
}

const STORY_DURATION_MS = 5000;

export function StoryViewer({
  stories,
  currentIndex,
  isOpen,
  onClose,
  onNext,
  onPrev,
  autoAdvance = true,
}: StoryViewerProps) {
  const currentStory = stories[currentIndex];
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);

  const onNextRef = useRef(onNext);
  const onCloseRef = useRef(onClose);
  const onPrevRef = useRef(onPrev);
  onNextRef.current = onNext;
  onCloseRef.current = onClose;
  onPrevRef.current = onPrev;

  // Swipe-down to close
  const dragY = useMotionValue(0);
  const overlayOpacity = useTransform(dragY, [0, 200], [1, 0.3]);
  const overlayScale = useTransform(dragY, [0, 200], [1, 0.9]);

  // Progress animation
  useEffect(() => {
    if (!autoAdvance || !currentStory || !isOpen) return;
    if (isPaused) return;

    const durationMs = (currentStory.duration || 5) * 1000;
    startTimeRef.current = Date.now() - progressRef.current * durationMs;

    const animate = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const p = Math.min(elapsed / durationMs, 1);
      progressRef.current = p;
      setProgress(p);

      if (p >= 1) {
        if (currentIndex < stories.length - 1) {
          onNextRef.current();
        } else {
          onCloseRef.current();
        }
        return;
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [currentIndex, currentStory, autoAdvance, isOpen, isPaused, stories.length]);

  // Reset progress on story change
  useEffect(() => {
    progressRef.current = 0;
    setProgress(0);
  }, [currentIndex]);

  const handleTap = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const midpoint = rect.width / 2;

    if (x < midpoint) {
      onPrevRef.current();
    } else {
      onNextRef.current();
    }
  }, []);

  const handlePointerDown = useCallback(() => {
    setIsPaused(true);
    pausedAtRef.current = progressRef.current;
  }, []);

  const handlePointerUp = useCallback(() => {
    setIsPaused(false);
  }, []);

  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
      if (info.offset.y > 100 || info.velocity.y > 300) {
        onCloseRef.current();
      }
    },
    [],
  );

  if (!currentStory) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black flex flex-col"
          style={{ opacity: overlayOpacity }}
        >
          <motion.div
            className="flex flex-col h-full"
            style={{ scale: overlayScale, y: dragY }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 200 }}
            dragElastic={0.4}
            onDragEnd={handleDragEnd}
          >
            {/* Segmented progress bars */}
            <div className="flex gap-1 p-3 pt-4">
              {stories.map((_, idx) => (
                <div key={idx} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full"
                    style={{
                      width:
                        idx < currentIndex
                          ? '100%'
                          : idx === currentIndex
                            ? `${progress * 100}%`
                            : '0%',
                      transition: idx === currentIndex ? 'none' : 'width 0.2s ease',
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xs font-bold">
                  {currentStory.authorName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{currentStory.authorName}</p>
                  <p className="text-white/60 text-xs">
                    {new Date(currentStory.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isPaused && <span className="text-xs text-white/60 font-medium">PAUSED</span>}
                <button
                  onClick={onClose}
                  className="text-white text-xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 min-w-touch min-h-touch"
                  aria-label="Close"
                >
                  &#10005;
                </button>
              </div>
            </div>

            {/* Story content */}
            <div
              className="flex-1 flex items-center justify-center cursor-pointer select-none"
              onClick={handleTap}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStory.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: 'spring', ...spring.snappy }}
                  className="w-full h-full flex items-center justify-center"
                >
                  {currentStory.type === 'text' ? (
                    <div className="px-8 text-center">
                      <p className="text-white text-2xl font-medium">{currentStory.text}</p>
                    </div>
                  ) : currentStory.mediaUrl ? (
                    <img
                      src={currentStory.mediaUrl}
                      alt="Story"
                      className="max-w-full max-h-full object-contain"
                      draggable={false}
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-b from-emerald-600 to-indigo-800 flex items-center justify-center">
                      <p className="text-white/60 text-lg">Story content</p>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Swipe indicator */}
            <div className="flex justify-center pb-6">
              <div className="w-10 h-1 rounded-full bg-white/30" />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default StoryViewer;
