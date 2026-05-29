'use client';

import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { spring } from '@quant/brand';
import { useMotionConfig } from './MotionConfig';

export interface SlidePanelProps {
  isOpen: boolean;
  side?: 'left' | 'right';
  width?: string;
  onClose?: () => void;
  children: React.ReactNode;
  className?: string;
  animated?: boolean;
}

export function SlidePanel({
  isOpen,
  side = 'right',
  width = '320px',
  onClose,
  children,
  className,
  animated = true,
}: SlidePanelProps) {
  const { shouldAnimate: contextAnimate } = useMotionConfig();
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = animated && contextAnimate && !prefersReducedMotion;

  const xOffset = side === 'right' ? '100%' : '-100%';

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    [side]: 0,
    width,
    height: '100%',
    zIndex: 50,
  };

  if (!shouldAnimate) {
    if (!isOpen) return null;
    return (
      <div className={className} style={panelStyle}>
        {children}
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={className}
          style={panelStyle}
          initial={{ x: xOffset }}
          animate={{ x: 0 }}
          exit={{ x: xOffset }}
          transition={{
            type: 'spring',
            damping: spring.stiff.damping,
            stiffness: spring.stiff.stiffness,
            mass: spring.stiff.mass,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && onClose) {
              onClose();
            }
          }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
