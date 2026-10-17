'use client';

import { useEffect, useState } from 'react';

/**
 * Current time, re-rendered once per minute on the minute boundary.
 *
 * The calendar header clock used `setInterval(…, 1000)` — 60 re-renders a
 * minute of the whole header for a display that only shows hours:minutes.
 */
export function useMinuteClock(): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(
      () => {
        setNow(new Date());
        interval = setInterval(() => setNow(new Date()), 60_000);
      },
      60_000 - (Date.now() % 60_000),
    );
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);
  return now;
}
