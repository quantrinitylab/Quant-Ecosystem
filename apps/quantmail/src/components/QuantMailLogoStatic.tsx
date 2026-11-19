import { useId } from 'react';

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
  // The ember-plate gradient id must be unique per instance. AuthShell renders
  // this mark twice (mobile + desktop copies) and Chrome resolves `url(#…)`
  // against the FIRST id in document order — with a static id the desktop
  // copy's plate fill resolved to the `display:none` mobile copy's `<defs>`
  // and rendered nothing (brand bug R12-NEW-1). Same pattern as AppMark /
  // GraphiteMark: derive the id from `useId`, sanitized for `url(#…)`.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const plateId = `qm-static-plate-${uid}`;
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
        <radialGradient id={plateId} gradientUnits="userSpaceOnUse" cx="42" cy="40" r="82">
          <stop offset="0" stopColor="#FFC189" />
          <stop offset="0.3" stopColor="#FF9450" />
          <stop offset="0.5" stopColor="var(--quant-primary)" />
          <stop offset="0.74" stopColor="#C8520F" />
          <stop offset="1" stopColor="#6E2606" />
        </radialGradient>
      </defs>
      {/* Ember plate */}
      <rect x="5" y="5" width="90" height="90" rx="22" fill={`url(#${plateId})`} />
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
      {/* Executive Sovereign Mail Monogram — Layered 3D Precision Geometric Mark */}
      {/* Base envelope body */}
      <rect x="20" y="28" width="60" height="44" rx="8" fill="#12151B" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
      
      {/* Inner envelope shadow fold */}
      <path d="M 22 70 L 44 48 L 56 48 L 78 70 Z" fill="#0A0C10" opacity="0.85" />
      
      {/* Bottom and side envelope faceted folds */}
      <path d="M 20 72 L 50 49 L 80 72 Z" fill="#181C24" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      
      {/* Dynamic left & right diagonal wing folds */}
      <path d="M 20 32 L 42 53 L 20 68 Z" fill="#141820" opacity="0.9" />
      <path d="M 80 32 L 58 53 L 80 68 Z" fill="#1C212B" opacity="0.9" />
      
      {/* Upper envelope flap — crisp white & amber faceted fold */}
      <path d="M 20 30 C 20 27 23 25 26 25 L 74 25 C 77 25 80 27 80 30 L 52.4 52.8 C 51 54 49 54 47.6 52.8 Z" fill="#FFFFFF" />
      
      {/* Upper flap inner shadow / dimension bevel */}
      <path d="M 21 28 L 50 51.5 L 79 28 Z" fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth="1.5" />

      {/* Sovereign Center Monogram / Amber Gem Aperture */}
      <circle cx="50" cy="51" r="5.5" fill="var(--quant-primary)" stroke="#FFFFFF" strokeWidth="1.8" />
      <circle cx="50" cy="51" r="2.2" fill="#FFFFFF" />
    </svg>
  );
}
