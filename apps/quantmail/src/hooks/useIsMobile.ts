'use client';

import { useEffect, useState } from 'react';

/**
 * The single source of truth for the mobile/desktop breakpoint.
 *
 * KEEP IN SYNC with `apps/quantmail/src/app/shell.css`:
 * the `@media (max-width: 899px)` single-pane rules and this `900` must
 * always describe the same boundary — CSS hides the reading pane below
 * 900px, and JS navigates to `/thread/:id` instead of selecting into the
 * (hidden) pane below 900px. If they drift, taps either open an invisible
 * pane or navigate away while the pane is still visible.
 */
export const MOBILE_BREAKPOINT_PX = 900;

/**
 * The exact media query the hook (and, by contract, shell.css) uses.
 * Pure and unit-testable: the P0 risk is this string drifting from the
 * CSS `@media (max-width: 899px)` rule.
 */
export function mobileMediaQuery(breakpoint: number = MOBILE_BREAKPOINT_PX): string {
  return `(max-width: ${breakpoint - 1}px)`;
}

/**
 * `true` when the viewport is narrower than {@link MOBILE_BREAKPOINT_PX}.
 *
 * Uses `matchMedia` so it reacts to resizes/rotations, and defaults to
 * `false` during SSR (desktop-first render, then corrects on hydration —
 * the inbox list renders identically either way, so there is no layout
 * shift, only the reading pane visibility flips).
 */
export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT_PX): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(mobileMediaQuery(breakpoint)).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const query = window.matchMedia(mobileMediaQuery(breakpoint));
    const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    setIsMobile(query.matches);
    // Modern browsers support addEventListener on MediaQueryList; fall back
    // to the deprecated addListener for older WebViews.
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }
    query.addListener(onChange);
    return () => query.removeListener(onChange);
  }, [breakpoint]);

  return isMobile;
}
