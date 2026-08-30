'use client';

import { useId, type ReactNode } from 'react';

/** Shared shape of every app mark in the ecosystem switcher. */
export type QuantLogoProps = {
  size?: number;
  className?: string;
  title?: string;
};

/**
 * Superellipse (n = 4) on a 32x32 box, inset 1.25 so the bezel stroke is not
 * clipped. Generated rather than hand-tuned, and `QuantMailLogo` clips its canvas
 * to the same curve — the family shares one silhouette so a row of marks reads as
 * one product suite instead of four unrelated glyphs.
 */
const SQUIRCLE =
  'M30.75 16C30.75 18.17 30.7 20.99 30.61 22.51C30.51 24.04 30.37 24.38 30.18 25.12C29.98 25.87 29.75 26.45 29.45 26.99C29.15 27.54 28.81 27.99 28.4 28.4C27.99 28.81 27.54 29.15 26.99 29.45C26.45 29.75 25.87 29.98 25.12 30.18C24.38 30.37 24.04 30.51 22.51 30.61C20.99 30.7 18.17 30.75 16 30.75C13.83 30.75 11.01 30.7 9.49 30.61C7.96 30.51 7.62 30.37 6.88 30.18C6.13 29.98 5.55 29.75 5.01 29.45C4.46 29.15 4.01 28.81 3.6 28.4C3.19 27.99 2.85 27.54 2.55 26.99C2.25 26.45 2.02 25.87 1.82 25.12C1.63 24.38 1.49 24.04 1.39 22.51C1.3 20.99 1.25 18.17 1.25 16C1.25 13.83 1.3 11.01 1.39 9.49C1.49 7.96 1.63 7.62 1.82 6.88C2.02 6.13 2.25 5.55 2.55 5.01C2.85 4.46 3.19 4.01 3.6 3.6C4.01 3.19 4.46 2.85 5.01 2.55C5.55 2.25 6.13 2.02 6.88 1.82C7.62 1.63 7.96 1.49 9.49 1.39C11.01 1.3 13.83 1.25 16 1.25C18.17 1.25 20.99 1.3 22.51 1.39C24.04 1.49 24.38 1.63 25.12 1.82C25.87 2.02 26.45 2.25 26.99 2.55C27.54 2.85 27.99 3.19 28.4 3.6C28.81 4.01 29.15 4.46 29.45 5.01C29.75 5.55 29.98 6.13 30.18 6.88C30.37 7.62 30.51 7.96 30.61 9.49C30.7 11.01 30.75 13.83 30.75 16Z';

/**
 * The colour every glyph is knocked out of the brand plate in — the dark canvas,
 * so a mark reads as one solid object with holes in it rather than as stacked
 * shapes. Filled holes survive at 16px where a 1.8-weight outline disappears.
 */
export const MARK_VOID = '#090A0C';

type AppMarkProps = QuantLogoProps & {
  /** Receives the `url(#…)` of the inner brand gradient for highlight details. */
  children: (brand: string) => ReactNode;
};

/**
 * The frame every sibling app mark is built on: one squircle, one brand gradient,
 * one bezel highlight. Previously each of the four logos redeclared this chrome
 * and its own `QuantLogoProps`, and each hardcoded its gradient id — so two
 * instances of the same mark in one document collided and the second resolved
 * against the first's `<defs>`. Ids are derived from `useId` here instead.
 */
export function AppMark({ size = 32, className = '', title = 'Quant', children }: AppMarkProps) {
  const raw = useId();
  const uid = raw.replace(/[^a-zA-Z0-9_-]/g, '');
  const plateId = `qm-plate-${uid}`;
  const brandId = `qm-brand-${uid}`;
  const rimId = `qm-rim-${uid}`;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] transition-transform duration-200 ease-out hover:scale-[1.04] motion-reduce:transition-none motion-reduce:hover:scale-100 ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={title}
      title={title}
    >
      <svg
        viewBox="0 0 32 32"
        width={size}
        height={size}
        className="h-full w-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={plateId} x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFB875" />
            <stop offset="0.52" stopColor="#FF8C42" />
            <stop offset="1" stopColor="#E8752F" />
          </linearGradient>
          <linearGradient id={brandId} x1="8" y1="8" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFB875" />
            <stop offset="1" stopColor="#FF8C42" />
          </linearGradient>
          <linearGradient
            id={rimId}
            x1="16"
            y1="1.25"
            x2="16"
            y2="18"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#FFFFFF" stopOpacity="0.34" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={SQUIRCLE} fill={`url(#${plateId})`} />
        {children(`url(#${brandId})`)}
        {/* Bezel last so the highlight sits over the glyph edge, as on real hardware. */}
        <path d={SQUIRCLE} stroke={`url(#${rimId})`} strokeWidth="1" />
      </svg>
    </span>
  );
}

export default AppMark;
