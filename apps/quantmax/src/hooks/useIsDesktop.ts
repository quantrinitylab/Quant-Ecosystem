// ============================================================================
// QuantMax - useIsDesktop hook
// SSR-safe viewport query: true when the viewport is at least the desktop
// breakpoint (1024px, matching Tailwind's `lg:`). Starts false (mobile-first)
// so server and first client render always match — no hydration flash.
// ============================================================================

import { useState, useEffect } from 'react';

export const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mq = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return isDesktop;
}

export default useIsDesktop;
