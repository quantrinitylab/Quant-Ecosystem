/** Motion and animation system for the Quant ecosystem */

export const spring = {
  /** Gentle spring for subtle transitions (modals, tooltips) */
  gentle: { damping: 20, stiffness: 100, mass: 1 },
  /** Snappy spring for interactive feedback (buttons, toggles) */
  snappy: { damping: 30, stiffness: 400, mass: 0.8 },
  /** Bouncy spring for playful elements (notifications, badges) */
  bouncy: { damping: 10, stiffness: 200, mass: 1.2 },
  /** Stiff spring for quick responses (dropdowns, menus) */
  stiff: { damping: 40, stiffness: 600, mass: 0.5 },
} as const;

export const easing = {
  /** Standard ease-out for enter transitions */
  easeOut: 'cubic-bezier(0.0, 0.0, 0.2, 1.0)',
  /** Standard ease-in for exit transitions */
  easeIn: 'cubic-bezier(0.4, 0.0, 1.0, 1.0)',
  /** Standard ease-in-out for move transitions */
  easeInOut: 'cubic-bezier(0.4, 0.0, 0.2, 1.0)',
  /** Spring-like overshoot for emphasis */
  springBounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  /** Smooth deceleration for natural feel */
  decelerate: 'cubic-bezier(0.0, 0.0, 0.0, 1.0)',
  /** Linear for continuous animations */
  linear: 'cubic-bezier(0.0, 0.0, 1.0, 1.0)',
} as const;

export const duration = {
  /** Instant feedback: 50ms */
  instant: 50,
  /** Fast interaction: 100ms */
  fast: 100,
  /** Normal transition: 200ms */
  normal: 200,
  /** Deliberate transition: 300ms */
  moderate: 300,
  /** Slow/cinematic transition: 500ms */
  slow: 500,
  /** Very slow/dramatic: 800ms */
  glacial: 800,
} as const;

export const motion = {
  spring,
  easing,
  duration,
} as const;
