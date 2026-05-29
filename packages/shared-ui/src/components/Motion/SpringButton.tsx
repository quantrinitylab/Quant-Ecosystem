'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { spring } from '@quant/brand';
import { useMotionConfig } from './MotionConfig';

export interface SpringButtonProps {
  scale?: number;
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  onFocus?: React.FocusEventHandler<HTMLButtonElement>;
  onBlur?: React.FocusEventHandler<HTMLButtonElement>;
  'aria-label'?: string;
  children: React.ReactNode;
  animated?: boolean;
}

export function SpringButton({
  scale = 0.97,
  children,
  className,
  disabled,
  type,
  onClick,
  onFocus,
  onBlur,
  'aria-label': ariaLabel,
  animated = true,
}: SpringButtonProps) {
  const { shouldAnimate: contextAnimate } = useMotionConfig();
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = animated && contextAnimate && !prefersReducedMotion;

  if (!shouldAnimate) {
    return (
      <button
        className={className}
        disabled={disabled}
        type={type}
        onClick={onClick}
        onFocus={onFocus}
        onBlur={onBlur}
        aria-label={ariaLabel}
      >
        {children}
      </button>
    );
  }

  return (
    <motion.button
      className={className}
      disabled={disabled}
      type={type}
      onClick={onClick}
      onFocus={onFocus}
      onBlur={onBlur}
      aria-label={ariaLabel}
      whileTap={{ scale }}
      transition={{
        type: 'spring',
        damping: spring.snappy.damping,
        stiffness: spring.snappy.stiffness,
        mass: spring.snappy.mass,
      }}
    >
      {children}
    </motion.button>
  );
}
