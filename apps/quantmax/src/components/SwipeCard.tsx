// ============================================================================
// QuantMax - Swipe Card Component
// Tinder-style swipe card with Framer Motion drag gestures and spring physics
// ============================================================================

import { useState } from 'react';
import {
  motion,
  useMotionValue,
  useTransform,
  AnimatePresence,
  useReducedMotion,
} from 'framer-motion';
import { spring } from '@quant/brand';
import type { UserProfile, MatchAction } from '../types';

interface SwipeCardProps {
  profile: UserProfile;
  onSwipe: (action: MatchAction) => void;
  onViewDetails: () => void;
  swipeDirection: 'left' | 'right' | 'up' | null;
  isAnimating: boolean;
}

export function SwipeCard({
  profile,
  onSwipe,
  onViewDetails,
  swipeDirection,
  isAnimating,
}: SwipeCardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-15, 15]);
  const likeOpacity = useTransform(x, [0, 100], [0, 1]);
  const nopeOpacity = useTransform(x, [-100, 0], [1, 0]);
  const prefersReducedMotion = useReducedMotion();

  const [dragDirection, setDragDirection] = useState<'left' | 'right' | null>(null);

  const handleDragEnd = (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
    const swipeThreshold = 100;
    const velocityThreshold = 500;

    if (info.offset.x > swipeThreshold || info.velocity.x > velocityThreshold) {
      onSwipe('like');
    } else if (info.offset.x < -swipeThreshold || info.velocity.x < -velocityThreshold) {
      onSwipe('pass');
    }
    setDragDirection(null);
  };

  const handleDrag = (_: unknown, info: { offset: { x: number } }) => {
    if (info.offset.x > 50) setDragDirection('right');
    else if (info.offset.x < -50) setDragDirection('left');
    else setDragDirection(null);
  };

  const exitAnimation = () => {
    if (!swipeDirection || !isAnimating) return {};
    const offsets = { left: -500, right: 500, up: 0 };
    const rotations = { left: -15, right: 15, up: 0 };
    return {
      x: offsets[swipeDirection],
      rotate: rotations[swipeDirection],
      opacity: 0,
    };
  };

  const photoUrl = profile.photos[0]?.url || profile.avatarUrl;

  const showLikeStamp = swipeDirection === 'right' || dragDirection === 'right';
  const showNopeStamp = swipeDirection === 'left' || dragDirection === 'left';

  return (
    <motion.div
      className="relative mx-auto w-full max-w-sm select-none overflow-hidden rounded-2xl bg-[var(--quant-card)] shadow-2xl"
      style={{ x, rotate }}
      drag={prefersReducedMotion ? false : 'x'}
      dragElastic={0.9}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      animate={isAnimating ? exitAnimation() : { x: 0, rotate: 0, opacity: 1 }}
      transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', ...spring.gentle }}
      aria-label={`Profile card for ${profile.displayName}`}
    >
      {/* Card Image */}
      <div
        className="relative h-[420px] bg-cover bg-center"
        style={{ backgroundImage: `url(${photoUrl})` }}
      >
        {/* LIKE Stamp */}
        <AnimatePresence>
          {showLikeStamp && (
            <motion.div
              initial={{ scale: 0, rotate: -12 }}
              animate={{ scale: 1, rotate: -12 }}
              exit={{ scale: 0 }}
              transition={{ type: 'spring', ...spring.bouncy }}
              style={{ opacity: likeOpacity }}
              className="absolute left-6 top-8 rounded-lg border-4 border-[var(--quant-success)] px-4 py-2"
            >
              <span className="text-3xl font-black text-[var(--quant-success)]">LIKE</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* NOPE Stamp */}
        <AnimatePresence>
          {showNopeStamp && (
            <motion.div
              initial={{ scale: 0, rotate: 12 }}
              animate={{ scale: 1, rotate: 12 }}
              exit={{ scale: 0 }}
              transition={{ type: 'spring', ...spring.bouncy }}
              style={{ opacity: nopeOpacity }}
              className="absolute right-6 top-8 rounded-lg border-4 border-[var(--quant-destructive)] px-4 py-2"
            >
              <span className="text-3xl font-black text-[var(--quant-destructive)]">NOPE</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Verification Badge */}
        {profile.verified === 'verified' && (
          <div
            className="absolute right-4 top-4 rounded-full bg-[var(--quant-info)] p-1.5"
            aria-label="Verified profile"
          >
            <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[var(--surface)]/90 to-transparent" />
      </div>

      {/* Card Content */}
      <button
        type="button"
        onClick={onViewDetails}
        className="w-full bg-[var(--quant-card)] px-5 py-4 text-left focus:outline-none focus:ring-2 focus:ring-brand-app"
        aria-label={`View details for ${profile.displayName}`}
      >
        <h2 className="text-xl font-bold text-[var(--quant-foreground)]">
          {profile.displayName}, {profile.age}
        </h2>
        {profile.job && (
          <p className="mt-0.5 text-sm text-[var(--quant-muted-foreground)]">{profile.job}</p>
        )}
        <p className="mt-0.5 text-sm text-[var(--foreground-secondary)]">{profile.location.city}</p>
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Interests">
          {profile.interests.slice(0, 4).map((interest) => (
            <span
              key={interest}
              className="inline-flex items-center rounded-full border border-brand-app/40 bg-brand-app/10 px-2.5 py-0.5 text-xs font-medium text-brand-app"
            >
              {interest}
            </span>
          ))}
        </div>
      </button>

      {/* Action Buttons */}
      <div className="flex items-center justify-center gap-5 border-t border-[var(--quant-border)] px-5 py-4">
        <motion.button
          type="button"
          onClick={() => onSwipe('pass')}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[var(--quant-destructive)] text-[var(--quant-destructive)] focus:outline-none focus:ring-2 focus:ring-[var(--quant-destructive)]"
          aria-label="Pass"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </motion.button>
        <motion.button
          type="button"
          onClick={() => onSwipe('superlike')}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[var(--quant-info)] text-[var(--quant-info)] focus:outline-none focus:ring-2 focus:ring-[var(--quant-info)]"
          aria-label="Super like"
        >
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </motion.button>
        <motion.button
          type="button"
          onClick={() => onSwipe('like')}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-[var(--quant-success)] text-[var(--quant-success)] focus:outline-none focus:ring-2 focus:ring-[var(--quant-success)]"
          aria-label="Like"
        >
          <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        </motion.button>
      </div>
    </motion.div>
  );
}

export default SwipeCard;
