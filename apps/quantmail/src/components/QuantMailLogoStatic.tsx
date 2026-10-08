/**
 * Static inline SVG of the QuantMail mark — the signature "M" with eyes on the
 * ember plate. Use for non-interactive placements (splash loader, signed-out
 * brand lockups) where the canvas `QuantMailLogo` would paint nothing until its
 * first rAF frame, leaving an empty box on first paint. This paints instantly:
 * pure SVG, no canvas, no timers, no framer-motion.
 *
 * Geometry is derived from `QuantMailLogo`'s own 100-unit buffer:
 * - plate: squircle 5..95 (half 45), corner radius 22, ember radial gradient
 *   centred at (42, 40) with the plate's own stops
 * - M: the original 54x44 bezier (x 23, y 30), canvas arcTo corners converted to
 *   SVG arcs
 * - eyes: pupils at (40.5, 60) / (59.5, 60), r 3.5, warm-dark; catchlight at the
 *   upper left, where the plate's light comes from
 *
 * The animated canvas `QuantMailLogo` stays the component for interactive
 * surfaces where blink / pupil-tracking / unread halo actually run.
 */

interface QuantMailLogoStaticProps {
  size?: number;
  className?: string;
  /** Accessible label; omit (with aria-hidden) when a sibling wordmark names the brand. */
  title?: string;
}

/** The M silhouette — bezier-for-bezier from `markMPath` in QuantMailLogo. */
const M_PATH =
  'M 30 74 A 7 7 0 0 1 23 67 L 23 42 ' +
  'C 23 34 27 30 32 30 ' +
  'C 38 32 44 47 50 47 ' +
  'C 56 47 62 32 68 30 ' +
  'C 73 30 77 34 77 42 ' +
  'L 77 67 A 7 7 0 0 1 70 74 Z';

export function QuantMailLogoStatic({ size = 42, className, title }: QuantMailLogoStaticProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <radialGradient id="qm-static-plate" gradientUnits="userSpaceOnUse" cx="42" cy="40" r="82">
          <stop offset="0" stopColor="#FFC189" />
          <stop offset="0.3" stopColor="#FF9450" />
          <stop offset="0.5" stopColor="var(--quant-primary)" />
          <stop offset="0.74" stopColor="#C8520F" />
          <stop offset="1" stopColor="#6E2606" />
        </radialGradient>
      </defs>
      {/* Ember plate */}
      <rect x="5" y="5" width="90" height="90" rx="22" fill="url(#qm-static-plate)" />
      <rect
        x="5.5"
        y="5.5"
        width="89"
        height="89"
        rx="21.5"
        fill="none"
        stroke="rgba(0,0,0,0.35)"
        strokeWidth="1"
      />
      {/* The M, flat white — the resting state of the animated mark */}
      <path d={M_PATH} fill="#FFFFFF" />
      {/* Eyes at rest: open pupils, catchlight upper-left */}
      <circle cx="40.5" cy="60" r="3.5" fill="#170F0A" />
      <circle cx="59.5" cy="60" r="3.5" fill="#170F0A" />
      <circle cx="39.45" cy="58.39" r="0.98" fill="#FFFFFF" opacity="0.86" />
      <circle cx="58.45" cy="58.39" r="0.98" fill="#FFFFFF" opacity="0.86" />
    </svg>
  );
}
