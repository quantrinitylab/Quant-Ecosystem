'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BRAND_SPRINGS } from '../../lib/motion-tokens';
import { MILESTONE_DAYS, isMilestone, type MilestoneDay } from '../../lib/gamification';
import type { Badge } from '../../providers/MicroInteractionProvider';

// ============================================================================
// Task 11.5: Streak Milestone Celebrations
// - Full-screen overlay with confetti/particle explosion
// - Milestones: 7, 30, 100, 365 day streaks
// - Awards a badge on each milestone
// - 2-second duration, then auto-dismiss
// ============================================================================

// Re-exported from the pure gamification module (single source of truth).
export { MILESTONE_DAYS, isMilestone };
export type { MilestoneDay };

const MILESTONE_CONFIG: Record<
  MilestoneDay,
  { emoji: string; title: string; color: string; badgeName: string }
> = {
  7: { emoji: '🔥', title: 'Week Warrior!', color: '#FF6B6B', badgeName: '7-Day Streak' },
  30: { emoji: '💫', title: 'Monthly Legend!', color: '#FFD700', badgeName: '30-Day Streak' },
  100: { emoji: '⚡', title: 'Century Champion!', color: '#9966FF', badgeName: '100-Day Streak' },
  365: { emoji: '👑', title: 'Eternal Bond!', color: '#FF9FF3', badgeName: '365-Day Streak' },
};

interface MilestoneAnimationProps {
  /** The milestone day count */
  milestone: MilestoneDay;
  /** Whether to show the animation */
  isVisible: boolean;
  /** Called when animation completes (after 2s) */
  onComplete?: () => void;
  /** Called with the badge to be awarded */
  onBadgeAwarded?: (badge: Badge) => void;
}

/** Generates confetti particles for the celebration */
function generateConfetti(count: number, color: string) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: (Math.random() - 0.5) * 400,
    y: -(100 + Math.random() * 300),
    rotation: Math.random() * 720 - 360,
    scale: 0.5 + Math.random() * 0.8,
    color: i % 3 === 0 ? color : i % 3 === 1 ? '#FFD700' : '#FFFFFF',
    delay: Math.random() * 0.3,
  }));
}

export function MilestoneAnimation({
  milestone,
  isVisible,
  onComplete,
  onBadgeAwarded,
}: MilestoneAnimationProps) {
  const [confetti] = useState(() => generateConfetti(40, MILESTONE_CONFIG[milestone].color));
  const config = MILESTONE_CONFIG[milestone];

  useEffect(() => {
    if (!isVisible) return;

    // Award badge
    if (onBadgeAwarded) {
      const badge: Badge = {
        id: `streak-${milestone}-${Date.now()}`,
        name: config.badgeName,
        description: `Maintained a ${milestone}-day streak!`,
        icon: config.emoji,
        unlockedAt: new Date(),
      };
      onBadgeAwarded(badge);
    }

    // Auto-dismiss after 2 seconds
    const timer = setTimeout(() => {
      onComplete?.();
    }, 2000);

    return () => clearTimeout(timer);
  }, [isVisible, milestone, config, onBadgeAwarded, onComplete]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Confetti particles */}
          {confetti.map((particle) => (
            <motion.div
              key={particle.id}
              className="absolute w-3 h-3 rounded-sm"
              style={{ backgroundColor: particle.color }}
              initial={{
                x: 0,
                y: 0,
                scale: 0,
                rotate: 0,
                opacity: 1,
              }}
              animate={{
                x: particle.x,
                y: particle.y,
                scale: particle.scale,
                rotate: particle.rotation,
                opacity: [1, 1, 0],
              }}
              transition={{
                duration: 1.8,
                delay: particle.delay,
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
            />
          ))}

          {/* Central celebration content */}
          <motion.div
            className="flex flex-col items-center gap-4 text-center"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{
              type: 'spring',
              ...BRAND_SPRINGS.bounce,
            }}
          >
            {/* Milestone emoji */}
            <motion.div
              className="text-7xl"
              animate={{
                scale: [1, 1.2, 1],
                rotate: [0, -10, 10, 0],
              }}
              transition={{ duration: 0.6, repeat: 2 }}
            >
              {config.emoji}
            </motion.div>

            {/* Title */}
            <motion.h2
              className="text-3xl font-bold text-white"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              {config.title}
            </motion.h2>

            {/* Day count */}
            <motion.p
              className="text-lg text-white/80"
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              {milestone} days strong! 🎉
            </motion.p>

            {/* Badge awarded indicator */}
            <motion.div
              className="mt-2 px-4 py-2 rounded-full bg-white/20 text-white text-sm"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5, type: 'spring', ...BRAND_SPRINGS.bounce }}
            >
              🏆 Badge Unlocked: {config.badgeName}
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default MilestoneAnimation;
