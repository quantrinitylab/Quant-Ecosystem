// ============================================================================
// Shared UI - useReducedMotion Hook
// ============================================================================

import { useReducedMotion as useFramerReducedMotion } from 'framer-motion';

/**
 * Returns true if the user prefers reduced motion.
 * Wraps framer-motion's useReducedMotion for consistent accessibility support.
 */
export function useReducedMotion(): boolean {
  return useFramerReducedMotion() ?? false;
}
