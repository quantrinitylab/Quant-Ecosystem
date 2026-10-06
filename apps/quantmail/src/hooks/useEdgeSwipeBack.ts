'use client';

import { useEffect, useRef } from 'react';

interface EdgeSwipeBackOptions {
  /** Distance from the left viewport edge (px) inside which a touch may start. Default 28. */
  edgeWidth?: number;
  /** Horizontal travel (px) needed to trigger back. Default 64. */
  minDistance?: number;
  /** Skip wiring entirely. Useful when a modal/lightbox owns the gesture. */
  disabled?: boolean;
}

/**
 * Edge-swipe back — the system-level gesture iOS and Android users expect.
 *
 * A touch that *starts* within `edgeWidth` px of the left viewport edge and
 * travels right past `minDistance` (staying mostly horizontal) fires `onBack`.
 * Starting-zone gating keeps it from colliding with in-content gestures
 * (row swipes, bubble swipes, text selection): nothing in the content area
 * lives that close to the edge, and vertical scrolls abort the track.
 *
 * Listeners are passive; the gesture never calls preventDefault, so it is
 * purely additive on top of native scrolling.
 */
export function useEdgeSwipeBack(onBack: () => void, options: EdgeSwipeBackOptions = {}) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  const { edgeWidth = 28, minDistance = 64, disabled = false } = options;

  useEffect(() => {
    if (disabled || typeof window === 'undefined') return;

    let tracking = false;
    let fired = false;
    let startX = 0;
    let startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        tracking = false;
        return;
      }
      const t = e.touches[0];
      if (t.clientX <= edgeWidth) {
        tracking = true;
        fired = false;
        startX = t.clientX;
        startY = t.clientY;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking || fired || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      if (dx >= minDistance && dx > dy * 2) {
        // Mostly-horizontal, travelled far enough: this is a back swipe.
        fired = true;
        tracking = false;
        onBackRef.current();
      } else if (dx < -12 || dy > 72) {
        // Went left or turned into a vertical scroll — not our gesture.
        tracking = false;
      }
    };

    const onTouchEnd = () => {
      tracking = false;
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [edgeWidth, minDistance, disabled]);
}
