'use client';

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================================
// Task 11.3: Like Particle Burst Animation
// - Spawns 12-20 small colored particles from the origin point
// - Each particle follows a randomized arc trajectory (Framer Motion animate)
// - 60fps target, 800ms total duration, particles fade + scale down
// ============================================================================

interface ParticleBurstProps {
  /** Whether the burst is active / visible */
  isActive: boolean;
  /** Origin point (x, y) relative to parent */
  origin?: { x: number; y: number };
  /** Number of particles (12-20) */
  particleCount?: number;
  /** Total duration in ms */
  duration?: number;
  /** Particle colors */
  colors?: string[];
  /** Callback when animation completes */
  onComplete?: () => void;
}

interface Particle {
  id: number;
  angle: number;
  distance: number;
  size: number;
  color: string;
  delay: number;
  arcOffset: number;
}

const DEFAULT_COLORS = [
  '#FF6B6B', '#FF8E53', '#FFCD56', '#4BC0C0',
  '#36A2EB', '#9966FF', '#FF6384', '#C9CBCF',
  '#FF9FF3', '#48DBFB', '#FECA57', '#FF6B6B',
];

export function ParticleBurst({
  isActive,
  origin = { x: 0, y: 0 },
  particleCount = 16,
  duration = 800,
  colors = DEFAULT_COLORS,
  onComplete,
}: ParticleBurstProps) {
  // Clamp particle count between 12-20
  const count = Math.max(12, Math.min(20, particleCount));

  // Generate randomized particle configurations
  const particles: Particle[] = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      angle: (360 / count) * i + (Math.random() - 0.5) * 30,
      distance: 40 + Math.random() * 60, // 40-100px travel
      size: 4 + Math.random() * 6, // 4-10px
      color: colors[i % colors.length],
      delay: Math.random() * 0.05, // 0-50ms stagger
      arcOffset: (Math.random() - 0.5) * 40, // arc curve randomization
    }));
  }, [count, colors]);

  const durationS = duration / 1000;

  return (
    <AnimatePresence onExitComplete={onComplete}>
      {isActive && (
        <motion.div
          className="absolute pointer-events-none"
          style={{ left: origin.x, top: origin.y }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {particles.map((particle) => {
            const rad = (particle.angle * Math.PI) / 180;
            const targetX = Math.cos(rad) * particle.distance;
            const targetY = Math.sin(rad) * particle.distance;
            // Arc midpoint with offset for curved trajectory
            const midX = targetX * 0.5 + particle.arcOffset;
            const midY = targetY * 0.5 - Math.abs(particle.arcOffset);

            return (
              <motion.div
                key={particle.id}
                className="absolute rounded-full"
                style={{
                  width: particle.size,
                  height: particle.size,
                  backgroundColor: particle.color,
                  left: -particle.size / 2,
                  top: -particle.size / 2,
                }}
                initial={{
                  x: 0,
                  y: 0,
                  scale: 1,
                  opacity: 1,
                }}
                animate={{
                  x: [0, midX, targetX],
                  y: [0, midY, targetY],
                  scale: [1, 1.2, 0],
                  opacity: [1, 0.9, 0],
                }}
                transition={{
                  duration: durationS,
                  delay: particle.delay,
                  ease: [0.25, 0.46, 0.45, 0.94], // custom easeOut arc
                }}
              />
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ParticleBurst;
