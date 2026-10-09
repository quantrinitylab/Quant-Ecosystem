'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { QuantLogoProps } from './AppMark';
import { useLiveMark, type MarkFrame } from './marks/useLiveMark';
import {
  paintCalendarMark,
  type CalendarMarkArt,
} from '../lib/marks/canvas-mark';
import {
  getCalendarLogoDate,
  msUntilMidnight,
  resolveCalendarTimezone,
  type CalendarLogoDate,
} from '../lib/calendar-logo-date';

/**
 * QuantCalendar logo — a dynamic 3D calendar mark painted live on canvas.
 *
 * The artwork follows the approved reference: a dark glass rounded frame,
 * layered paper sheets with real thickness, two metallic binding rings, a
 * cobalt header carrying the current month + year, and a white face with the
 * weekday above a prominent date numeral.
 *
 * The date is *authoritative*, not decorative: it comes from the user's
 * configured calendar timezone (the same `quant_calendar_timezone` key the
 * calendar app uses), recomputed only when the day actually changes —
 * never per animation frame. A timer fires at the next local midnight; the
 * date also refreshes when the tab regains visibility, the window regains
 * focus, or the timezone setting changes in another tab.
 *
 * Rendering reuses the family's live-mark architecture (`useLiveMark` +
 * `canvas-mark` painters, the same pipeline as QuantMailLogo): one
 * requestAnimationFrame loop, DPR-supersampled buffer, pointer tilt, hover
 * easing, pause-when-hidden, and a single static frame under
 * `prefers-reduced-motion`. No Three.js — the repository has no WebGL/Three
 * stack for text-bearing marks, and canvas text stays crisp at every DPR.
 */
function useCalendarLogoDate(): CalendarLogoDate {
  const [timeZone, setTimeZone] = useState<string>(() => resolveCalendarTimezone());
  const [now, setNow] = useState(() => new Date());

  // Refresh the timezone if the user changes it (same tab or another tab).
  useEffect(() => {
    const sync = () => setTimeZone(resolveCalendarTimezone());
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);

  // Fire once at the next local midnight in the calendar timezone, then
  // re-arm. Also refresh when returning from background — timers are
  // throttled while hidden, so the date could be stale.
  useEffect(() => {
    let timer: number | null = null;
    const arm = () => {
      if (timer !== null) window.clearTimeout(timer);
      const wait = msUntilMidnight(new Date(), timeZone);
      timer = window.setTimeout(() => {
        setNow(new Date());
        arm();
      }, wait);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setNow(new Date());
        arm();
      }
    };
    arm();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [timeZone]);

  return getCalendarLogoDate(now, timeZone);
}

export function QuantCalendarLogo({ size = 28, className = '', title }: QuantLogoProps) {
  const date = useCalendarLogoDate();

  // The painter reads the date through a ref so a midnight rollover repaints
  // without restarting the animation loop.
  const artRef = useRef<CalendarMarkArt>({
    monthYear: '',
    weekday: '',
    day: 1,
  });
  const prevKeyRef = useRef<string>('');
  const introRef = useRef(0);
  const mountedAtRef = useRef(0);

  const dateKey = `${date.year}-${date.month}-${date.day}`;
  if (prevKeyRef.current !== dateKey) {
    prevKeyRef.current = dateKey;
    artRef.current = {
      monthYear: date.monthYear.toUpperCase(),
      weekday: date.weekday.toUpperCase(),
      day: date.day,
    };
    // Midnight rollover: a short re-settle instead of a hard cut.
    if (mountedAtRef.current !== 0) introRef.current = 0;
  }

  const paint = useCallback(
    ({ ctx, time, tiltX, tiltY, hover, reduced }: MarkFrame) => {
      // Mount intro: ease 0→1 over ~450ms; skipped under reduced motion.
      if (mountedAtRef.current === 0) mountedAtRef.current = time;
      if (!reduced && introRef.current < 1) {
        introRef.current = Math.min(1, introRef.current + 1 / 27); // ~450ms at 60fps
      } else if (reduced) {
        introRef.current = 1;
      }
      paintCalendarMark(ctx, artRef.current, {
        time: reduced ? 0 : time,
        tiltX,
        tiltY,
        hover,
        intro: introRef.current,
      });
    },
    [],
  );

  const { canvasRef, pointerProps, repaint } = useLiveMark(paint, size);

  // When the painted date changes (midnight), force one frame even under
  // reduced motion, where the loop is parked.
  useEffect(() => {
    repaint();
  }, [dateKey, repaint]);

  const accessibleName =
    title ??
    `QuantCalendar — ${date.weekday}, ${date.month} ${date.day}, ${date.year}`;

  return (
    <span
      role="img"
      aria-label={accessibleName}
      title={accessibleName}
      className={`inline-flex shrink-0 select-none items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="h-full w-full"
        aria-hidden="true"
        {...pointerProps}
      />
    </span>
  );
}
