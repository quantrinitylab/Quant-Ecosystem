/**
 * Motion Tokens — Framer Motion spring-physics animation curves
 *
 * Central source-of-truth for all animation spring configs and shared variants.
 * Based on @quant/brand spring tokens, extended with QuantChat-specific patterns.
 */

// ─── Brand Spring Configurations ────────────────────────────────────────────

export const BRAND_SPRINGS = {
  /** Bouncy spring for playful elements (notifications, badges, celebrations) */
  bounce: { stiffness: 300, damping: 20, mass: 1 },
  /** Gentle spring for subtle transitions (modals, tooltips, content shifts) */
  gentle: { stiffness: 150, damping: 25, mass: 1 },
  /** Snappy spring for interactive feedback (buttons, toggles, page transitions) */
  snappy: { stiffness: 500, damping: 30, mass: 0.8 },
} as const;

export type SpringPreset = keyof typeof BRAND_SPRINGS;

// ─── Page Transition Variants ───────────────────────────────────────────────

export const pageTransitionVariants = {
  initial: {
    opacity: 0,
    y: 8,
    scale: 0.99,
  },
  enter: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring' as const,
      ...BRAND_SPRINGS.snappy,
    },
  },
  exit: {
    opacity: 0,
    y: -8,
    scale: 0.99,
    transition: {
      type: 'spring' as const,
      ...BRAND_SPRINGS.snappy,
    },
  },
} as const;

// ─── Haptic Feedback Variants ───────────────────────────────────────────────

export const hapticTap = {
  scale: 0.95,
  transition: { duration: 0.05 },
} as const;

export const hapticPress = {
  scale: 0.92,
  transition: { duration: 0.05 },
} as const;

// ─── Common UI Pattern Variants ─────────────────────────────────────────────

/** Fade-in from below — for list items, cards entering viewport */
export const fadeInUp = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, ...BRAND_SPRINGS.gentle },
  },
  exit: { opacity: 0, y: 12, transition: { duration: 0.15 } },
} as const;

/** Scale-in from center — for modals, popovers, toasts */
export const scaleIn = {
  initial: { opacity: 0, scale: 0.9 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring' as const, ...BRAND_SPRINGS.bounce },
  },
  exit: { opacity: 0, scale: 0.9, transition: { duration: 0.15 } },
} as const;

/** Slide-up from bottom — for bottom sheets, drawers */
export const slideUp = {
  initial: { opacity: 0, y: '100%' },
  animate: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, ...BRAND_SPRINGS.snappy },
  },
  exit: { opacity: 0, y: '100%', transition: { duration: 0.2 } },
} as const;

/** Stagger children — for lists and grids */
export const staggerContainer = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
} as const;

export const staggerItem = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, ...BRAND_SPRINGS.gentle },
  },
} as const;

/** Pulse animation — for notifications, live indicators */
export const pulse = {
  animate: {
    scale: [1, 1.05, 1],
    transition: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' },
  },
} as const;

/** Shake animation — for errors, invalid inputs */
export const shake = {
  animate: {
    x: [0, -4, 4, -4, 4, 0],
    transition: { duration: 0.4 },
  },
} as const;
