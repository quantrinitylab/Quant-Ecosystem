// ============================================================================
// QuantChat - AvatarReaction (Task 5.7)
//
// Animates the alien avatar performing a reaction emotion. Every emotion in
// {happy, sad, surprised, angry, love} maps to a non-null Framer Motion
// animation (Property 13):
//   happy     → bounce
//   sad       → droop (sink + slight tilt)
//   surprised → pop (quick scale overshoot)
//   angry     → shake (horizontal jitter)
//   love      → scale-pulse (heartbeat) with floating hearts
// ============================================================================
'use client';

import React from 'react';
import { motion, type Variants } from 'framer-motion';
import type { ReactionEmotion } from '../../types/avatar';

export interface AvatarReactionProps {
  emotion: ReactionEmotion;
  size?: number;
  /** Loop the animation (default) or play once. */
  loop?: boolean;
  children: React.ReactNode;
  className?: string;
}

/** Animation descriptor per emotion — guaranteed non-null for all 5 emotions. */
export const REACTION_ANIMATIONS: Record<ReactionEmotion, Variants> = {
  happy: {
    animate: {
      y: [0, -10, 0],
      transition: { duration: 0.6, repeat: Infinity, ease: 'easeInOut' },
    },
  },
  sad: {
    animate: {
      y: [0, 6, 0],
      rotate: [0, -6, 0],
      transition: { duration: 0.8, repeat: Infinity, ease: 'easeInOut' },
    },
  },
  surprised: {
    animate: {
      scale: [1, 1.25, 1],
      transition: { duration: 0.5, repeat: Infinity, ease: 'easeOut' },
    },
  },
  angry: {
    animate: {
      x: [0, -4, 4, -4, 4, 0],
      transition: { duration: 0.5, repeat: Infinity, ease: 'linear' },
    },
  },
  love: {
    animate: {
      scale: [1, 1.12, 1, 1.12, 1],
      transition: { duration: 0.7, repeat: Infinity, ease: 'easeInOut' },
    },
  },
};

/** Returns the (always non-null) animation variants for an emotion. */
export function getReactionAnimation(emotion: ReactionEmotion): Variants {
  return REACTION_ANIMATIONS[emotion];
}

export function AvatarReaction({
  emotion,
  size = 48,
  loop = true,
  children,
  className = '',
}: AvatarReactionProps) {
  const variants = getReactionAnimation(emotion);
  // When not looping, run the keyframes a single time.
  const oneShot: Variants = loop
    ? variants
    : {
        animate: {
          ...(variants.animate as object),
          transition: {
            ...((variants.animate as { transition?: object }).transition ?? {}),
            repeat: 0,
          },
        },
      };

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <motion.div
        variants={oneShot}
        animate="animate"
        className="h-full w-full"
        style={{ transformOrigin: 'center' }}
      >
        {children}
      </motion.div>

      {/* Floating hearts overlay for the love emotion */}
      {emotion === 'love' && (
        <>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              aria-hidden
              className="absolute text-pink-500"
              style={{ left: `${30 + i * 20}%`, bottom: 0, fontSize: size * 0.28 }}
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: [0, 1, 0], y: [-2, -size * 0.7] }}
              transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.25 }}
            >
              ♥
            </motion.span>
          ))}
        </>
      )}
    </div>
  );
}

export default AvatarReaction;
