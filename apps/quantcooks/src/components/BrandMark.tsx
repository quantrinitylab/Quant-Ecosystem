// ============================================================================
// QuantCooks — the brand mark ("Spring Q"), hand-authored SVG.
//
// Design-upgrade D-0 (plan §4.5), colour per Krish's brand correction
// (2026-10-29): the primary accent is QC Spring Green #2FE07A — the
// product's own green, deliberately NOT the ember/orange direction the
// first Phase A pass used (superseded) and NOT any competitor's lime.
// An original mark, drawn as vector paths by hand on a 24×24 grid —
// no image tracing, no icon font, no stock glyph, and structurally
// nothing like any other product's mark.
//
// Construction (grid units, y down):
//   Bowl — a bold ring: outer Ø20 centred (12, 11), inner counter Ø9.5.
//   The ring opens on the lower right (between +10° and +62°) where the
//   tail leaves the bowl.
//   Tail — a leaf: it roots across the ring band below the opening (the
//   Q's tail stroke), crosses the opening, then rises along the bowl's
//   right contour as a young leaf — one smooth convex outer edge, one
//   gentle inner sweep, a single pointed tip at (21.6, 3.4). A leaf /
//   flame hybrid stroke: fresh growth and cooking fire in one gesture.
//   The counter (the Ø9.5 hole) is never touched by the leaf, so the
//   mark stays legible down to 16px (verified at 16/28/44/96/240px).
//
// Variants (plan §4.5 — the only two allowed):
//   'accent' — 135° gradient, QC Spring Green #2FE07A → its 50% white
//              tint #97F0BC, for dark surfaces (shell, login lockup,
//              favicon).
//   'mono'   — single colour via currentColor, for buttons and
//              anywhere the mark sits on the accent itself (renders
//              black there — the system's on-accent tone).
// ============================================================================

import React, { useId } from 'react';

/** Bowl: ring with the lower-right opening where the tail leaves. */
export const BRAND_MARK_RING_PATH =
  'M 16.69 19.83 A 10 10 0 1 1 21.85 12.74 L 16.68 11.83 A 4.75 4.75 0 1 0 14.23 15.19 Z';

/** Tail: the leaf — root across the band, tip at (21.6, 3.4). */
export const BRAND_MARK_LEAF_PATH =
  'M 14.9 19.3 C 19.2 20.5 22.9 18.3 23.3 14.2 C 23.6 10.8 22.9 6.4 21.6 3.4 ' +
  'C 20.4 6.3 19.6 9.5 18.9 12.9 C 18.1 16.4 17.1 18.8 14.9 19.3 Z';

/** QC Spring Green ramp stops for the 'accent' variant. */
export const BRAND_MARK_GRADIENT_STOPS = ['#2FE07A', '#97F0BC'] as const;

export interface BrandMarkProps {
  /** Rendered width/height in px. The mark's minimum size is 16. */
  size?: number;
  variant?: 'accent' | 'mono';
  className?: string;
}

/**
 * The QuantCooks mark. Decorative by default (`aria-hidden`): it always
 * sits beside the wordmark text, which carries the name for AT.
 */
export const BrandMark: React.FC<BrandMarkProps> = ({
  size = 24,
  variant = 'accent',
  className,
}) => {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const gradientId = `qc-accent-mark-${uid}`;
  const fill = variant === 'accent' ? `url(#${gradientId})` : 'currentColor';

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {variant === 'accent' ? (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor={BRAND_MARK_GRADIENT_STOPS[0]} />
            <stop offset="1" stopColor={BRAND_MARK_GRADIENT_STOPS[1]} />
          </linearGradient>
        </defs>
      ) : null}
      <path d={BRAND_MARK_RING_PATH} fill={fill} />
      <path d={BRAND_MARK_LEAF_PATH} fill={fill} />
    </svg>
  );
};

export default BrandMark;
