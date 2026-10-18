'use client';

import { useEffect, useState } from 'react';

/**
 * useSlowLoadNotice — honest loading-state honesty for slow cold loads.
 *
 * Returns true once `isLoading` has stayed true continuously for `timeoutMs`.
 * Resets to false the moment `isLoading` flips false (data arrived, errored,
 * or the query key changed). The timer restarts from zero on every new
 * loading spell — a refetch that resolves in 2s never trips the notice.
 *
 * Why this exists (QM 2026-10-15 P1, mobile /contacts): on a slow mobile
 * cold load the contacts list can sit on its skeleton placeholders past any
 * reasonable wait with no feedback and no way out. The page now swaps the
 * skeletons for an honest "still loading" notice with a Retry action once
 * the load passes the threshold, so the UI never strands the user on
 * placeholders indefinitely.
 */
export function useSlowLoadNotice(isLoading: boolean, timeoutMs = 10_000): boolean {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setSlow(false);
      return;
    }
    setSlow(false);
    const timer = setTimeout(() => setSlow(true), timeoutMs);
    return () => clearTimeout(timer);
  }, [isLoading, timeoutMs]);

  return slow;
}
