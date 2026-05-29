// ============================================================================
// Shared UI - useOrientation Hook
// ============================================================================

import { useState, useEffect } from 'react';

export type Orientation = 'portrait' | 'landscape';

function getOrientation(): Orientation {
  if (typeof window === 'undefined') return 'portrait';
  return window.matchMedia('(orientation: landscape)').matches ? 'landscape' : 'portrait';
}

/**
 * Returns the current device orientation using matchMedia.
 */
export function useOrientation(): Orientation {
  const [orientation, setOrientation] = useState<Orientation>(getOrientation);

  useEffect(() => {
    const mql = window.matchMedia('(orientation: landscape)');
    const handler = (e: MediaQueryListEvent) => {
      setOrientation(e.matches ? 'landscape' : 'portrait');
    };

    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return orientation;
}
