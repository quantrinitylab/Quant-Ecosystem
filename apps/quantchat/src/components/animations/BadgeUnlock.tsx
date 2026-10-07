'use client';

import React, { useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BRAND_SPRINGS } from '../../lib/motion-tokens';
import type { Badge } from '../../providers/MicroInteractionProvider';

// ============================================================================
// Task 11.12: Badge Unlock Animation
// - Full-screen overlay, 2-second duration
// - Badge icon scales up from 0 → 1 with BRAND_SPRINGS.bounce
// - Gold particle explosion behind
// - Emits a `sound-ready` custom event (for optional sound integration)
// ============================================================================

interface BadgeUnlockProps {
  /** The badge being unlocked */
  badge: Badge | null;
  /** Whether to show the animation */
  isVisible: boolean;
  /** Called when animation completes (after 2s) */
  onComplete?: () => void;
}

/** Gold particle configuration for explosion behind badge */
interface GoldParticle {
  id: number;
  angle: number;
  distance: number;
  size: number;
  delay: number;
  opacity: number;
}

function generateGoldParticles(count: number): GoldParticle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    angle: (360 / count) * i + (Math.random() - 0.5) * 20,
    distance: 60 + Math.random() * 100,
    size: 3 + Math.random() * 5,
    delay: Math.random() * 0.2,
    opacity: 0.6 + Math.random() * 0.4,
  }));
}

export function BadgeUnlock({
  badge,
  isVisible,
  onComplete,
}: BadgeUnlockProps) {
  const particles = useMemo(() => generateGoldParticles(24), []);

  useEffect(() => {
    if (!isVisible || !badge) return;

    // Emit sound-ready custom event for optional sound integration
    const soundEvent = new CustomEvent('sound-ready', {
      detail: {
        type: 'badge-unlock',
        badgeId: badge.id,
        badgeName: badge.name,
      },
    });
    window.dispatchEvent(soundEvent);

    // Auto-dismiss after 2 seconds
    const timer = setTimeout(() => {
      onComplete?.();
    }, 2000);

    return () => clearTimeout(timer);
  }, [isVisible, badge, onComplete]);

  return (
    <AnimatePresence>
      {isVisible && badge && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Gold particle explosion */}
          {particles.map((particle) => {
            const rad = (particle.angle * Math.PI) / 180;
            const targetX = Math.cos(rad) * particle.distance;
            const targetY = Math.sin(rad) * particle.distance;

            return (
              <motion.div
                key={particle.id}
                className="absolute rounded-full"
                style={{
                  width: particle.size,
                  height: particle.size,
                  background: `radial-gradient(circle, #FFD700, #FFA500)`,
                  boxShadow: '0 0 4px #FFD700',
                  left: '50%',
                  top: '50%',
                  marginLeft: -particle.size / 2,
                  marginTop: -particle.size / 2,
                }}
                initial={{
                  x: 0,
                  y: 0,
                  scale: 0,
                  opacity: particle.opacity,
                }}
                animate={{
                  x: targetX,
                  y: targetY,
                  scale: [0, 1.5, 0.5],
                  opacity: [particle.opacity, particle.opacity, 0],
                }}
                transition={{
                  duration: 1.2,
                  delay: particle.delay,
                  ease: [0.25, 0.46, 0.45, 0.94],
                }}
              />
            );
          })}

          {/* Central glow ring */}
          <motion.div
            className="absolute w-32 h-32 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(255,215,0,0.4) 0%, transparent 70%)',
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: [0, 2, 2.5],
              opacity: [0, 0.8, 0],
            }}
            transition={{ duration: 1.0 }}
          />

          {/* Badge icon — scales from 0 to 1 with BRAND_SPRINGS.bounce */}
          <motion.div
            className="flex flex-col items-center gap-4 text-center relative z-10"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{
              type: 'spring',
              ...BRAND_SPRINGS.bounce,
            }}
          >
            {/* Badge icon */}
            <motion.div
              className="w-24 h-24 rounded-2xl bg-gradient-to-br from-yellow-400 via-yellow-500 to-orange-500 flex items-center justify-center shadow-2xl shadow-yellow-500/50"
              animate={{
                boxShadow: [
                  '0 0 20px rgba(255,215,0,0.5)',
                  '0 0 40px rgba(255,215,0,0.8)',
                  '0 0 20px rgba(255,215,0,0.5)',
                ],
              }}
              transition={{ duration: 1.5, repeat: 1 }}
            >
              <span className="text-5xl">{badge.icon}</span>
            </motion.div>

            {/* Badge name */}
            <motion.h3
              className="text-xl font-bold text-white"
              initial={{ y: 15, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              🏆 Badge Unlocked!
            </motion.h3>

            <motion.p
              className="text-lg text-yellow-300 font-semibold"
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              {badge.name}
            </motion.p>

            {badge.description && (
              <motion.p
                className="text-sm text-white/70 max-w-[250px]"
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                {badge.description}
              </motion.p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default BadgeUnlock;
