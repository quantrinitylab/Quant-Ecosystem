'use client';

import React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { hapticTap } from '../../lib/motion-tokens';

/**
 * HapticButton — Wraps any interactive element with a Framer Motion
 * whileTap={{ scale: 0.95 }} animation completing in 50ms.
 *
 * Usage:
 *   <HapticButton onClick={handleClick} className="px-4 py-2 bg-blue-500">
 *     Click me
 *   </HapticButton>
 *
 *   <HapticButton as="a" href="/route">Link text</HapticButton>
 */

type HapticButtonProps<T extends React.ElementType = 'button'> = {
  /** The element type to render. Defaults to 'button'. */
  as?: T;
  /** Override the default tap scale (0.95). */
  tapScale?: number;
  children: React.ReactNode;
} & Omit<HTMLMotionProps<'button'>, 'as'>;

export const HapticButton = React.forwardRef<HTMLButtonElement, HapticButtonProps>(
  function HapticButton({ as: _as, tapScale = 0.95, children, ...props }, ref) {
    return (
      <motion.button
        ref={ref}
        whileTap={{ scale: tapScale, transition: { duration: 0.05 } }}
        whileHover={{ scale: 1.02 }}
        {...props}
      >
        {children}
      </motion.button>
    );
  },
);

/**
 * withHaptic — HOC that wraps any component with haptic-like feedback.
 *
 * Usage:
 *   const HapticDiv = withHaptic(motion.div);
 *   <HapticDiv onClick={handler}>...</HapticDiv>
 */
export function withHaptic(Component: React.ComponentType<HTMLMotionProps<'div'>>) {
  function WithHaptic(props: HTMLMotionProps<'div'>) {
    return <Component whileTap={hapticTap} whileHover={{ scale: 1.02 }} {...props} />;
  }
  WithHaptic.displayName = `withHaptic(${Component.displayName || Component.name || 'Component'})`;
  return WithHaptic;
}

/**
 * useHapticProps — Hook that returns motion props for haptic feedback.
 * Apply these to any Framer Motion component.
 *
 * Usage:
 *   const haptic = useHapticProps();
 *   <motion.div {...haptic}>...</motion.div>
 */
export function useHapticProps(tapScale = 0.95) {
  return {
    whileTap: { scale: tapScale, transition: { duration: 0.05 } },
    whileHover: { scale: 1.02 },
  } as const;
}

export default HapticButton;
