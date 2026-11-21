'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CalendarEventLike, EntryType } from '../types';
import { MONTHS_SHORT, FULL_WEEKDAYS } from '../types';
import { dayKey, startOf, endOf, hhmm, toTimeInput, lastDayOf } from '../lib/calendar-geometry';
import type { Holiday } from '../../../lib/holidays';

export interface WeekViewSheetOpts {
  startTime?: string;
  endTime?: string;
}

export interface CalendarWeekViewProps {
  events: CalendarEventLike[];
  holidaysByDay?: Record<string, Holiday[]>;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  openDedicatedSheet: (type: EntryType, date?: Date, opts?: WeekViewSheetOpts) => void;
  onSelectEvent: (event: CalendarEventLike) => void;
  /**
   * Drag-to-reschedule: fired when the user drops a timed event chip onto a
   * new day/time slot. Absent = the gesture stays disabled (chips tap-to-open only).
   */
  onRescheduleEvent?: (event: CalendarEventLike, newStart: Date, newEnd: Date) => void;
  /** 0 = Sunday first, 1 = Monday first (default, matches month grid) */
  weekStartsOn?: 0 | 1;
  className?: string;
}

/** Pixels per hour in the time grid (Google Calendar uses ~60). */
export const WEEK_HOUR_HEIGHT = 56;
const SNAP_MINUTES = 15;
const DAY_MINUTES = 24 * 60;

export function weekStartOf(date: Date, weekStartsOn: 0 | 1 = 1): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = d.getDay(); // 0 = Sunday .. 6 = Saturday
  const diff = (dow - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

export function minutesToTop(minutes: number): number {
  return (minutes / 60) * WEEK_HOUR_HEIGHT;
}

export function minutesToTimeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return toTimeInput(new Date(2000, 0, 1, h, m));
}

/** Snap a minute count to the grid step (pure, unit-testable). */
export function snapMinutes(minutes: number, snap: number = SNAP_MINUTES): number {
  return Math.round(minutes / snap) * snap;
}

/**
 * Minutes-from-midnight for a pointer Y inside the time grid, snapped to the
 * grid and clamped to the day. Pure and unit-testable — backs both
 * drag-to-create and drag-to-reschedule.
 */
export function minutesFromClientY(clientY: number, rectTop: number): number {
  const raw = Math.round(((clientY - rectTop) / WEEK_HOUR_HEIGHT) * 60);
  return Math.max(0, Math.min(DAY_MINUTES, snapMinutes(raw)));
}

/** Preserved event duration in minutes (never below one grid step). */
export function eventDurationMinutes(event: CalendarEventLike): number {
  const s = startOf(event).getTime();
  const e = endOf(event).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return SNAP_MINUTES;
  return Math.max(SNAP_MINUTES, Math.round((e - s) / 60000));
}

export interface RescheduledRange {
  start: Date;
  end: Date;
}

/**
 * New [start, end) for a drag-reschedule onto `targetDay` at `startMin`:
 * duration is preserved and the start is clamped so the event never spills
 * past midnight. Pure and unit-testable.
 */
export function rescheduledRange(
  event: CalendarEventLike,
  targetDay: Date,
  startMin: number,
): RescheduledRange {
  const duration = eventDurationMinutes(event);
  const clampedStart = Math.max(0, Math.min(DAY_MINUTES - duration, snapMinutes(startMin)));
  const start = new Date(
    targetDay.getFullYear(),
    targetDay.getMonth(),
    targetDay.getDate(),
    Math.floor(clampedStart / 60),
    clampedStart % 60,
    0,
    0,
  );
  return { start, end: new Date(start.getTime() + duration * 60000) };
}

export interface DayEventInput {
  event: CalendarEventLike;
  /** Minutes from midnight, clamped to [0, 1440] */
  startMin: number;
  endMin: number;
}

export interface PositionedEvent extends DayEventInput {
  top: number;
  height: number;
  col: number;
  colCount: number;
}

/**
 * Greedy column layout for overlapping timed events within one day.
 * Events are clustered by transitive overlap; each cluster gets colCount
 * columns so overlapping events render side-by-side like Google Calendar.
 */
export function layoutDayEvents(inputs: DayEventInput[]): PositionedEvent[] {
  const sorted = [...inputs].sort(
    (a, b) => a.startMin - b.startMin || a.endMin - b.endMin,
  );
  const result: PositionedEvent[] = [];
  let cluster: PositionedEvent[] = [];
  const colEnds: number[] = [];
  let clusterEnd = -1;

  const flushCluster = () => {
    const colCount = Math.max(1, colEnds.length);
    for (const p of cluster) {
      p.colCount = colCount;
      result.push(p);
    }
    cluster = [];
    colEnds.length = 0;
    clusterEnd = -1;
  };

  for (const input of sorted) {
    if (cluster.length > 0 && input.startMin >= clusterEnd) flushCluster();
    let col = colEnds.findIndex((end) => end <= input.startMin);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(input.endMin);
    } else {
      colEnds[col] = input.endMin;
    }
    clusterEnd = Math.max(clusterEnd, input.endMin);
    cluster.push({
      ...input,
      top: minutesToTop(input.startMin),
      height: Math.max(24, minutesToTop(input.endMin) - minutesToTop(input.startMin)),
      col,
      colCount: 1,
    });
  }
  flushCluster();
  return result;
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function eventColor(ev: CalendarEventLike): string {
  return ev.color || 'var(--app-accent)';
}

export function CalendarWeekView({
  events,
  holidaysByDay = {},
  selectedDate,
  onSelectDate,
  openDedicatedSheet,
  onSelectEvent,
  onRescheduleEvent,
  weekStartsOn = 1,
  className = '',
}: CalendarWeekViewProps) {
  // Current time ticks every 60s; todayKey derives from it (NOT a
  // mount-only memo) so the today highlight and the now-line follow a
  // midnight rollover without a remount.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
  const todayKey = dayKey(now);
  const selectedKey = dayKey(selectedDate);

  // Anchor week state (internal, like CalendarMonthSubView's viewDate).
  const [anchorDate, setAnchorDate] = useState<Date>(() => new Date(selectedDate));

  // Keep the visible week in sync when selectedDate moves outside it
  // (e.g. the page header's Today / month steppers).
  useEffect(() => {
    const curStart = weekStartOf(anchorDate, weekStartsOn).getTime();
    const selStart = weekStartOf(selectedDate, weekStartsOn).getTime();
    if (curStart !== selStart) setAnchorDate(new Date(selectedDate));
  }, [selectedDate, anchorDate, weekStartsOn]);

  const weekStart = useMemo(() => weekStartOf(anchorDate, weekStartsOn), [anchorDate, weekStartsOn]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    }),
    [weekStart],
  );

  const weekdayNames = useMemo(() => {
    // FULL_WEEKDAYS is Sunday-first; rotate for Monday-first.
    if (weekStartsOn === 1) return [...FULL_WEEKDAYS.slice(1), FULL_WEEKDAYS[0]];
    return FULL_WEEKDAYS;
  }, [weekStartsOn]);

  const weekLabel = useMemo(() => {
    const s = days[0];
    const e = days[6];
    const sameMonth = s.getMonth() === e.getMonth();
    const sameYear = s.getFullYear() === e.getFullYear();
    if (sameMonth) return `${MONTHS_SHORT[s.getMonth()]} ${s.getDate()} – ${e.getDate()}, ${s.getFullYear()}`;
    if (sameYear)
      return `${MONTHS_SHORT[s.getMonth()]} ${s.getDate()} – ${MONTHS_SHORT[e.getMonth()]} ${e.getDate()}, ${s.getFullYear()}`;
    return `${MONTHS_SHORT[s.getMonth()]} ${s.getDate()}, ${s.getFullYear()} – ${MONTHS_SHORT[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
  }, [days]);

  const goPrevWeek = () => {
    const next = new Date(anchorDate);
    next.setDate(next.getDate() - 7);
    setAnchorDate(next);
    onSelectDate(next);
  };
  const goNextWeek = () => {
    const next = new Date(anchorDate);
    next.setDate(next.getDate() + 7);
    setAnchorDate(next);
    onSelectDate(next);
  };
  const goToday = () => {
    const now = new Date();
    setAnchorDate(now);
    onSelectDate(now);
  };

  // ---- event bucketing -------------------------------------------------
  const { timedByDay, allDayByDay } = useMemo(() => {
    const timed: PositionedEvent[][] = days.map(() => []);
    const allDay: CalendarEventLike[][] = days.map(() => []);
    days.forEach((day, di) => {
      const dayStartMs = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
      const dayEndMs = dayStartMs + DAY_MINUTES * 60 * 1000;
      const inputs: DayEventInput[] = [];
      for (const ev of events) {
        const s = startOf(ev);
        const e = endOf(ev);
        if (Number.isNaN(s.getTime())) continue;
        if (ev.allDay) {
          // fix/qm-calendar-multiday-span: an all-day event occupies every
          // day from its start through its last day (midnight-exact ends
          // are exclusive — see lastDayOf), not just its start day.
          const last = lastDayOf(ev);
          if (last && dayKey(day) >= dayKey(s) && dayKey(day) <= dayKey(last)) {
            allDay[di].push(ev);
          }
          continue;
        }
        if (Number.isNaN(e.getTime())) continue;
        if (e.getTime() <= dayStartMs || s.getTime() >= dayEndMs) continue;
        const startMin = Math.max(0, Math.round((s.getTime() - dayStartMs) / 60000));
        const endMin = Math.min(DAY_MINUTES, Math.round((e.getTime() - dayStartMs) / 60000));
        if (endMin > startMin) inputs.push({ event: ev, startMin, endMin });
      }
      timed[di] = layoutDayEvents(inputs);
    });
    return { timedByDay: timed, allDayByDay: allDay };
  }, [events, days]);

  // ---- current time (state + ticker declared above, next to todayKey) ----
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Scroll so the current time is visible on first mount (Google-like).
    const el = bodyRef.current;
    if (el) el.scrollTop = Math.max(0, minutesToTop(nowMinutes) - 160);
  }, []);

  // ---- drag-to-create ---------------------------------------------------
  const [drag, setDrag] = useState<null | { dayIndex: number; startMin: number; curMin: number }>(null);

  const minutesFromPointer = (e: React.PointerEvent, el: HTMLElement): number => {
    const rect = el.getBoundingClientRect();
    return minutesFromClientY(e.clientY, rect.top);
  };

  const handleColumnPointerDown = (dayIndex: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    // Don't start a drag when the user pressed on an event chip.
    if ((e.target as HTMLElement).closest('[data-week-event]')) return;
    const mins = minutesFromPointer(e, e.currentTarget);
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ dayIndex, startMin: mins, curMin: mins });
  };

  const handleColumnPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    setDrag({ ...drag, curMin: minutesFromPointer(e, e.currentTarget) });
  };

  const finishDrag = (dayIndex: number) => {
    if (!drag || drag.dayIndex !== dayIndex) return;
    const d = drag;
    setDrag(null);
    const lo = Math.min(d.startMin, d.curMin);
    const hi = Math.max(d.startMin, d.curMin);
    const day = days[dayIndex];
    if (hi - lo < SNAP_MINUTES) {
      // Plain click: quick-create a 1-hour event at the clicked hour.
      const hourStart = Math.floor(lo / 60) * 60;
      openDedicatedSheet('event', day, {
        startTime: minutesToTimeLabel(hourStart),
        endTime: minutesToTimeLabel(Math.min(DAY_MINUTES, hourStart + 60)),
      });
    } else {
      openDedicatedSheet('event', day, {
        startTime: minutesToTimeLabel(lo),
        endTime: minutesToTimeLabel(hi),
      });
    }
  };

  const dragLo = drag ? Math.min(drag.startMin, drag.curMin) : 0;
  const dragHi = drag ? Math.max(drag.startMin, drag.curMin) : 0;

  // ---- drag-to-reschedule: move a timed event to a new day/time slot -----
  // Google-Calendar pattern: mouse drags lift after a few px of travel;
  // touch/pen uses tap-and-hold (450ms) so scrolling the grid keeps working.
  interface MoveDragState {
    event: CalendarEventLike;
    originDayIndex: number;
    originStartMin: number;
    durationMin: number;
    pointerId: number;
    pointerKind: string;
    startX: number;
    startY: number;
    lifted: boolean;
    curDayIndex: number;
    curStartMin: number;
  }
  const [moveDrag, setMoveDrag] = useState<MoveDragState | null>(null);
  const moveDragRef = useRef<MoveDragState | null>(null);
  const liftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressChipClickRef = useRef(false);

  const setMoveDragBoth = (s: MoveDragState | null) => {
    moveDragRef.current = s;
    setMoveDrag(s);
  };
  const clearLiftTimer = () => {
    if (liftTimerRef.current !== null) {
      clearTimeout(liftTimerRef.current);
      liftTimerRef.current = null;
    }
  };

  // Escape cancels an in-flight move.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && moveDragRef.current) {
        clearLiftTimer();
        setMoveDragBoth(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const dayIndexFromPoint = (clientX: number, clientY: number): number | null => {
    const el = document
      .elementFromPoint(clientX, clientY)
      ?.closest?.('[data-week-day-index]');
    if (!el) return null;
    const i = Number(el.getAttribute('data-week-day-index'));
    return Number.isInteger(i) && i >= 0 && i < days.length ? i : null;
  };

  const minutesInColumnAtPoint = (dayIndex: number, clientY: number): number | null => {
    const col = document.querySelector(`[data-testid="week-day-column-${dayIndex}"]`);
    if (!col) return null;
    return minutesFromClientY(clientY, col.getBoundingClientRect().top);
  };

  const liftMoveDrag = (chipEl: HTMLElement) => {
    const d = moveDragRef.current;
    if (!d || d.lifted) return;
    try {
      chipEl.setPointerCapture(d.pointerId);
    } catch {
      // Non-primary pointers or detached nodes: the move simply won't track.
    }
    setMoveDragBoth({ ...d, lifted: true });
  };

  const handleChipPointerDown =
    (p: PositionedEvent, originDayIndex: number) =>
    (e: React.PointerEvent<HTMLButtonElement>) => {
      // Keep the column's drag-to-create from firing under the chip.
      e.stopPropagation();
      if (!onRescheduleEvent || p.event.recurrence) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.isPrimary === false) return;
      const state: MoveDragState = {
        event: p.event,
        originDayIndex,
        originStartMin: p.startMin,
        durationMin: eventDurationMinutes(p.event),
        pointerId: e.pointerId,
        pointerKind: e.pointerType,
        startX: e.clientX,
        startY: e.clientY,
        lifted: false,
        curDayIndex: originDayIndex,
        curStartMin: p.startMin,
      };
      setMoveDragBoth(state);
      if (e.pointerType === 'mouse') {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Pointer already released: the move simply won't track.
        }
      } else {
        // Touch/pen: tap-and-hold to lift; scrolling before the hold fires
        // is left to the browser (no capture, no preventDefault).
        // NOTE: capture e.currentTarget NOW — the synthetic event's
        // currentTarget is null once dispatch ends (no pooling in React 17+,
        // but currentTarget is still only valid during dispatch).
        const chipEl = e.currentTarget;
        liftTimerRef.current = setTimeout(() => {
          liftTimerRef.current = null;
          liftMoveDrag(chipEl);
        }, 450);
      }
    };

  const handleChipPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = moveDragRef.current;
    if (!d) return;
    if (!d.lifted) {
      const moved = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
      if (d.pointerKind === 'mouse') {
        if (moved > 10) liftMoveDrag(e.currentTarget);
      } else if (moved > 10) {
        // Touch drifted before the hold fired: it's a scroll or tap — bail.
        clearLiftTimer();
        setMoveDragBoth(null);
      }
      return;
    }
    const di = dayIndexFromPoint(e.clientX, e.clientY);
    if (di === null) return;
    const mins = minutesInColumnAtPoint(di, e.clientY);
    if (mins === null) return;
    if (di !== d.curDayIndex || mins !== d.curStartMin) {
      setMoveDragBoth({ ...d, curDayIndex: di, curStartMin: mins });
    }
    e.preventDefault();
  };

  const handleChipPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = moveDragRef.current;
    clearLiftTimer();
    if (!d) return;
    setMoveDragBoth(null);
    suppressChipClickRef.current = false;
    if (d.lifted && onRescheduleEvent) {
      const changed =
        d.curDayIndex !== d.originDayIndex || d.curStartMin !== d.originStartMin;
      // A lifted pointer always consumed the gesture: never fall through to
      // the chip's click-to-open handler after a drag.
      suppressChipClickRef.current = true;
      if (changed) {
        const { start, end } = rescheduledRange(d.event, days[d.curDayIndex], d.curStartMin);
        onRescheduleEvent(d.event, start, end);
      }
    }
  };

  const handleChipPointerCancel = () => {
    clearLiftTimer();
    setMoveDragBoth(null);
  };

  const hours = useMemo(() => Array.from({ length: 24 }, (_, h) => h), []);

  return (
    <div className={`flex flex-col h-full bg-[var(--quant-background)] text-white ${className}`} data-testid="calendar-week-view">
      {/* Week toolbar: prev/next + range label + Today (synced with page header via selectedDate effect) */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#232938] shrink-0">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goPrevWeek}
            aria-label="Previous week"
            data-testid="week-prev"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[var(--quant-muted-foreground)] hover:text-white hover:bg-[var(--quant-surface-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={goNextWeek}
            aria-label="Next week"
            data-testid="week-next"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[var(--quant-muted-foreground)] hover:text-white hover:bg-[var(--quant-surface-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
          >
            <ChevronRightIcon className="size-4" />
          </button>
          <h2 className="text-sm font-semibold text-[var(--quant-foreground)] ml-1 whitespace-nowrap" data-testid="week-range-label">
            {weekLabel}
          </h2>
        </div>
        <button
          type="button"
          onClick={goToday}
          data-testid="week-today"
          className="min-h-[44px] px-4 rounded-lg text-xs font-medium text-[var(--quant-muted-foreground)] hover:text-white hover:bg-[var(--quant-surface-elevated)] border border-[#232938] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
        >
          Today
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-x-auto">
        <div className="min-w-[640px] h-full flex flex-col">
          {/* Day headers */}
          <div className="flex shrink-0 border-b border-[#232938] sticky top-0 bg-[var(--quant-background)] z-10">
            <div className="w-12 shrink-0" aria-hidden="true" />
            {days.map((day, i) => {
              const k = dayKey(day);
              const isToday = k === todayKey;
              const isSelected = k === selectedKey;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => onSelectDate(day)}
                  aria-label={`${weekdayNames[i]}, ${MONTHS_SHORT[day.getMonth()]} ${day.getDate()}`}
                  aria-pressed={isSelected}
                  data-testid={`week-day-header-${i}`}
                  className="flex-1 min-w-0 flex flex-col items-center py-2 gap-0.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] hover:bg-[#101218]"
                >
                  <span className={`text-[10px] font-medium uppercase tracking-wide ${isToday ? 'text-[var(--app-accent)]' : 'text-[var(--quant-muted-foreground)]'}`}>
                    {weekdayNames[i].slice(0, 3)}
                  </span>
                  <span
                    className={`flex items-center justify-center size-8 rounded-full text-sm font-semibold ${
                      isToday
                        ? 'bg-[var(--app-accent)] text-black shadow-[0_0_12px_color-mix(in_srgb,var(--app-accent)_40%,transparent)]'
                        : isSelected
                          ? 'bg-[#232938] text-white'
                          : 'text-[var(--quant-foreground)]'
                    }`}
                  >
                    {day.getDate()}
                  </span>
                </button>
              );
            })}
          </div>

          {/* All-day row */}
          <div className="flex shrink-0 border-b border-[#232938] max-h-24 overflow-y-auto">
            <div className="w-12 shrink-0 flex items-start justify-center pt-2">
              <span className="text-[10px] text-[var(--quant-muted-foreground)] uppercase tracking-wide">All-day</span>
            </div>
            {days.map((day, i) => {
              const k = dayKey(day);
              const chips = allDayByDay[i];
              const dayHolidays = holidaysByDay[k] ?? [];
              return (
                <div key={k} className="flex-1 min-w-0 border-l border-[#232938]/40 px-1 py-1 space-y-1" data-testid={`week-allday-${i}`}>
                  {dayHolidays.map((h, hi) => (
                    <div
                      key={`h-${hi}`}
                      className="truncate text-[11px] px-1.5 py-0.5 rounded bg-[#1a2b1a] text-[#7ee787] border border-[#7ee787]/30"
                      title={h.name}
                    >
                      🎉 {h.name}
                    </div>
                  ))}
                  {chips.map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => onSelectEvent(ev)}
                      data-week-event
                      title={ev.title}
                      className="w-full truncate text-left text-[11px] px-1.5 py-0.5 rounded border-l-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
                      style={{
                        borderLeftColor: eventColor(ev),
                        backgroundColor: `${eventColor(ev)}26`,
                        color: '#F5F5F5',
                      }}
                    >
                      {ev.title}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Time grid body */}
          <div ref={bodyRef} className="flex-1 min-h-0 overflow-y-auto relative" data-testid="week-grid-body">
            <div className="flex" style={{ height: minutesToTop(DAY_MINUTES) }}>
              {/* Time gutter */}
              <div className="w-12 shrink-0 sticky left-0 bg-[var(--quant-background)] z-[5]" aria-hidden="true">
                {hours.map((h) => (
                  <div key={h} className="relative" style={{ height: WEEK_HOUR_HEIGHT }}>
                    <span className="absolute -top-2 right-1 text-[10px] text-[var(--quant-muted-foreground)]">
                      {h === 0 ? '' : `${h > 12 ? h - 12 : h}${h >= 12 ? 'p' : 'a'}`}
                    </span>
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {days.map((day, di) => {
                const k = dayKey(day);
                const isToday = k === todayKey;
                return (
                  <div
                    key={k}
                    role="button"
                    tabIndex={0}
                    aria-label={`${weekdayNames[di]} time slots. Press Enter or C to create an event; left and right arrows move between days.`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'c' || e.key === 'C') {
                        // The calendar scope also binds `c` (new event) at the
                        // document level — stop it so the sheet opens exactly
                        // once, on the focused day rather than the selected date.
                        e.stopPropagation();
                        openDedicatedSheet('event', day);
                        return;
                      }
                      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                        // Roving focus across the day columns (grid-style
                        // keyboard triage); nothing else binds these keys here.
                        e.preventDefault();
                        const grid = e.currentTarget.closest('[data-testid="week-grid-body"]');
                        const cols = grid
                          ? Array.from(grid.querySelectorAll<HTMLElement>('[data-week-day-index]'))
                          : [];
                        const next = cols[di + (e.key === 'ArrowRight' ? 1 : -1)];
                        next?.focus();
                      }
                    }}
                    onPointerDown={handleColumnPointerDown(di)}
                    onPointerMove={handleColumnPointerMove}
                    onPointerUp={() => finishDrag(di)}
                    onPointerCancel={() => setDrag(null)}
                    data-testid={`week-day-column-${di}`}
                    data-week-day-index={di}
                    className="flex-1 min-w-0 relative border-l border-[#232938]/40 cursor-crosshair focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-accent)]"
                    style={{ touchAction: 'pan-y' }}
                  >
                    {/* Hour lines */}
                    {hours.map((h) => (
                      <div
                        key={h}
                        className="border-b border-[#232938]/30"
                        style={{ height: WEEK_HOUR_HEIGHT }}
                        aria-hidden="true"
                      />
                    ))}

                    {/* Current time indicator */}
                    {isToday && (
                      <div
                        className="absolute left-0 right-0 z-[6] pointer-events-none"
                        style={{ top: minutesToTop(nowMinutes) }}
                        data-testid="week-now-line"
                        aria-hidden="true"
                      >
                        <div className="relative h-0 border-t-2 border-[#EA4335]">
                          <span className="absolute -left-1 -top-[7px] size-3 rounded-full bg-[#EA4335] shadow-[0_0_8px_#EA4335]" />
                        </div>
                      </div>
                    )}

                    {/* Drag selection highlight */}
                    {drag && drag.dayIndex === di && dragHi - dragLo >= SNAP_MINUTES && (
                      <div
                        className="absolute left-1 right-1 z-[5] rounded bg-[color-mix(in_srgb,var(--app-accent)_25%,transparent)] border border-[color-mix(in_srgb,var(--app-accent)_60%,transparent)] pointer-events-none"
                        style={{ top: minutesToTop(dragLo), height: Math.max(14, minutesToTop(dragHi) - minutesToTop(dragLo)) }}
                        data-testid="week-drag-highlight"
                        aria-hidden="true"
                      />
                    )}

                    {/* Move ghost: where the lifted event will land on drop */}
                    {moveDrag?.lifted && moveDrag.curDayIndex === di && (
                      <div
                        className="absolute left-1 right-1 z-[7] rounded-md border-2 border-dashed border-[#F59E0B] bg-[#F59E0B]/15 pointer-events-none"
                        style={{
                          top: minutesToTop(moveDrag.curStartMin) + 1,
                          height: Math.max(22, (moveDrag.durationMin / 60) * WEEK_HOUR_HEIGHT - 2),
                        }}
                        data-testid="week-move-ghost"
                        aria-hidden="true"
                      />
                    )}

                    {/* Events */}
                    {timedByDay[di].map((p) => {
                      const color = eventColor(p.event);
                      const widthPct = 100 / p.colCount;
                      const isDragging = moveDrag?.lifted && moveDrag.event.id === p.event.id;
                      const canReschedule = !!onRescheduleEvent && !p.event.recurrence;
                      return (
                        <button
                          key={p.event.id}
                          type="button"
                          data-week-event
                          data-week-event-id={p.event.id}
                          onClick={(e) => {
                            if (suppressChipClickRef.current) {
                              suppressChipClickRef.current = false;
                              e.stopPropagation();
                              return;
                            }
                            e.stopPropagation();
                            onSelectEvent(p.event);
                          }}
                          onPointerDown={handleChipPointerDown(p, di)}
                          onPointerMove={handleChipPointerMove}
                          onPointerUp={handleChipPointerUp}
                          onPointerCancel={handleChipPointerCancel}
                          title={
                            canReschedule
                              ? `${p.event.title} · ${hhmm(startOf(p.event))} – ${hhmm(endOf(p.event))} · drag to reschedule`
                              : `${p.event.title} · ${hhmm(startOf(p.event))} – ${hhmm(endOf(p.event))}`
                          }
                          aria-roledescription={canReschedule ? 'Draggable event' : undefined}
                          data-testid={`week-event-${p.event.id}`}
                          className={`absolute z-[4] text-left rounded-md border-l-[3px] px-1.5 py-0.5 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white hover:brightness-125 transition ${
                            isDragging ? 'opacity-40' : ''
                          } ${canReschedule ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                          style={{
                            top: p.top + 1,
                            height: Math.max(22, p.height - 2),
                            left: `calc(${(p.col * widthPct).toFixed(2)}% + 2px)`,
                            width: `calc(${widthPct.toFixed(2)}% - 4px)`,
                            borderLeftColor: color,
                            backgroundColor: `${color}2e`,
                            touchAction: isDragging ? 'none' : undefined,
                          }}
                        >
                          <div className="truncate text-[11px] font-semibold leading-tight text-white">
                            {p.event.title}
                          </div>
                          <div className="truncate text-[10px] leading-tight text-white/70">
                            {hhmm(startOf(p.event))} – {hhmm(endOf(p.event))}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
