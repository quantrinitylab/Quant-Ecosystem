'use client';

import { useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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

  // Use refs for callbacks to avoid stale closure in the auto-advance timer
  const onNextRef = useRef(onNext);
  const onCloseRef = useRef(onClose);
  const onPrevRef = useRef(onPrev);
  onNextRef.current = onNext;
  onCloseRef.current = onClose;
  onPrevRef.current = onPrev;

  useEffect(() => {
    if (!autoAdvance || !currentStory || !isOpen) return;

    const timer = setTimeout(() => {
      if (currentIndex < stories.length - 1) {
        onNextRef.current();
      } else {
        onCloseRef.current();
      }
    }, currentStory.duration * 1000);

    return () => clearTimeout(timer);
  }, [currentIndex, currentStory, autoAdvance, isOpen, stories.length]);

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

  if (!currentStory) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black flex flex-col"
        >
          {/* Progress bars */}
          <div className="flex gap-1 p-3 pt-4">
            {stories.map((_, idx) => (
              <div key={idx} className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    idx < currentIndex
                      ? 'bg-white w-full'
                      : idx === currentIndex
                        ? 'bg-white animate-[progress_linear]'
                        : 'bg-transparent w-0'
                  }`}
                  style={
                    idx === currentIndex
                      ? {
                          width: '100%',
                          animation: `progress ${currentStory.duration}s linear forwards`,
                        }
                      : idx < currentIndex
                        ? { width: '100%' }
                        : { width: '0%' }
                  }
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
            <button
              onClick={onClose}
              className="text-white text-xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10"
              aria-label="Close"
            >
              &#10005;
            </button>
          </div>

          {/* Story content */}
          <div
            className="flex-1 flex items-center justify-center cursor-pointer"
            onClick={handleTap}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStory.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
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
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-b from-emerald-600 to-indigo-800 flex items-center justify-center">
                    <p className="text-white/60 text-lg">Story content</p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default StoryViewer;
