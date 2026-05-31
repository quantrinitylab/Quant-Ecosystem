// ============================================================================
// QuantMax - Video Feed Component
// Full-screen video scroller with engagement actions and Framer Motion transitions
// ============================================================================

import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '@quant/brand';
import type { ShortVideo } from '../types';
import { LoadingSkeleton } from './LoadingSkeleton';

interface VideoFeedProps {
  videos: ShortVideo[];
  activeIndex: number;
  onScroll: (direction: 'up' | 'down') => void;
  onDoubleTap: (videoId: string) => void;
  onLongPress: (videoId: string) => void;
  isLoading?: boolean;
}

const sidebarItemVariants = {
  hidden: { opacity: 0, x: 20, scale: 0.8 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { type: 'spring', ...spring.snappy, delay: i * 0.08 },
  }),
};

export function VideoFeed({
  videos,
  activeIndex,
  onScroll: _onScroll,
  onDoubleTap,
  onLongPress,
  isLoading,
}: VideoFeedProps) {
  if (isLoading) {
    return <LoadingSkeleton variant="video-feed" />;
  }

  const activeVideo = videos[activeIndex];

  return (
    <div
      className="relative h-full w-full overflow-hidden bg-[var(--surface)]"
      role="feed"
      aria-label="Video feed"
    >
      <AnimatePresence mode="wait">
        {activeVideo && (
          <motion.div
            key={activeVideo.id}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ type: 'spring', ...spring.gentle }}
            className="absolute inset-0"
          >
            {/* Video */}
            <video
              src={activeVideo.videoUrl}
              loop
              autoPlay
              className="h-full w-full object-cover"
              aria-label={`Video by ${activeVideo.creator.username}`}
              onDoubleClick={() => onDoubleTap(activeVideo.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                onLongPress(activeVideo.id);
              }}
            />

            {/* Info Overlay */}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pb-20">
              <span className="text-sm font-bold text-white">@{activeVideo.creator.username}</span>
              <p className="mt-1 text-sm text-gray-200 line-clamp-2">{activeVideo.caption}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-gray-300" aria-hidden="true">
                  &#9835;
                </span>
                <span className="truncate text-xs text-gray-300">{activeVideo.sound.name}</span>
              </div>
            </div>

            {/* Engagement Sidebar */}
            <div
              className="absolute bottom-32 right-3 flex flex-col items-center gap-5"
              role="group"
              aria-label="Engagement actions"
            >
              <motion.div
                custom={0}
                variants={sidebarItemVariants}
                initial="hidden"
                animate="visible"
                className="flex flex-col items-center"
              >
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => onDoubleTap(activeVideo.id)}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-elevated)]/60 text-white focus:outline-none focus:ring-2 focus:ring-brand-app"
                  aria-label={`Like video, ${activeVideo.likes} likes`}
                >
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                </motion.button>
                <span className="mt-1 text-xs text-white">{activeVideo.likes}</span>
              </motion.div>

              <motion.div
                custom={1}
                variants={sidebarItemVariants}
                initial="hidden"
                animate="visible"
                className="flex flex-col items-center"
              >
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-elevated)]/60 text-white"
                  aria-label={`${activeVideo.comments} comments`}
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                </div>
                <span className="mt-1 text-xs text-white">{activeVideo.comments}</span>
              </motion.div>

              <motion.div
                custom={2}
                variants={sidebarItemVariants}
                initial="hidden"
                animate="visible"
                className="flex flex-col items-center"
              >
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-elevated)]/60 text-white"
                  aria-label={`${activeVideo.shares} shares`}
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                    />
                  </svg>
                </div>
                <span className="mt-1 text-xs text-white">{activeVideo.shares}</span>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default VideoFeed;
