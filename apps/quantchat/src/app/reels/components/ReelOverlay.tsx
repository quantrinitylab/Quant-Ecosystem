// ============================================================================
// QuantChat - ReelOverlay Component (Task 3.4)
// Overlaid on each reel with creator info, actions, and engagement buttons
// Like button with heart fill + particle burst animation on tap
// ============================================================================
'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Reel } from '../../../hooks/useReelsFeed';

interface ReelOverlayProps {
  reel: Reel;
  onLike: (reelId: string) => void;
  onUnlike: (reelId: string) => void;
  onComment: (reelId: string) => void;
  onShare: (reelId: string) => void;
}

function formatCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

// Particle burst for like animation
function LikeParticles({ show }: { show: boolean }) {
  if (!show) return null;

  const particles = Array.from({ length: 6 }, (_, i) => ({
    id: i,
    angle: i * 60 * (Math.PI / 180),
  }));

  return (
    <AnimatePresence>
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute left-1/2 top-1/2 h-2 w-2 rounded-full bg-red-500"
          initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
          animate={{
            x: Math.cos(p.angle) * 24,
            y: Math.sin(p.angle) * 24,
            scale: 0,
            opacity: 0,
          }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      ))}
    </AnimatePresence>
  );
}

export function ReelOverlay({ reel, onLike, onUnlike, onComment, onShare }: ReelOverlayProps) {
  const [showParticles, setShowParticles] = useState(false);

  const handleLikeTap = useCallback(() => {
    if (reel.isLikedByUser) {
      onUnlike(reel.id);
    } else {
      onLike(reel.id);
      setShowParticles(true);
      setTimeout(() => setShowParticles(false), 600);
    }
  }, [reel.id, reel.isLikedByUser, onLike, onUnlike]);

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-end">
      {/* Bottom section: creator info (left) + actions (right) */}
      <div className="flex items-end justify-between p-4 pb-8">
        {/* Left side: creator info + caption */}
        <div className="pointer-events-auto flex max-w-[70%] flex-col gap-2">
          {/* Creator avatar + username */}
          <div className="flex items-center gap-2">
            <img
              src={reel.creatorAvatar}
              alt={reel.creatorUsername}
              className="h-10 w-10 rounded-full border-2 border-white object-cover"
            />
            <span className="text-sm font-semibold text-white drop-shadow-lg">
              @{reel.creatorUsername}
            </span>
          </div>

          {/* Caption text */}
          <p className="text-sm text-white drop-shadow-lg line-clamp-3">{reel.caption}</p>
        </div>

        {/* Right side: vertical action stack */}
        <div className="pointer-events-auto flex flex-col items-center gap-5">
          {/* Like button */}
          <button
            onClick={handleLikeTap}
            className="relative flex flex-col items-center gap-1"
            aria-label={reel.isLikedByUser ? 'Unlike' : 'Like'}
          >
            <motion.div
              whileTap={{ scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 500, damping: 15 }}
            >
              <HeartIcon filled={reel.isLikedByUser} />
            </motion.div>
            <LikeParticles show={showParticles} />
            <span className="text-xs font-medium text-white">{formatCount(reel.likeCount)}</span>
          </button>

          {/* Comment icon */}
          <button
            onClick={() => onComment(reel.id)}
            className="flex flex-col items-center gap-1"
            aria-label="Comments"
          >
            <CommentIcon />
            <span className="text-xs font-medium text-white">{formatCount(reel.commentCount)}</span>
          </button>

          {/* Share icon */}
          <button
            onClick={() => onShare(reel.id)}
            className="flex flex-col items-center gap-1"
            aria-label="Share"
          >
            <ShareIcon />
            <span className="text-xs font-medium text-white">{formatCount(reel.shareCount)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// SVG Icons
function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill={filled ? '#ef4444' : 'none'}
      stroke={filled ? '#ef4444' : 'white'}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

export default ReelOverlay;
