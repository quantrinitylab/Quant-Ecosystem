'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CalendarEventLike, EntryType } from '../types';
import { MONTHS_SHORT, FULL_WEEKDAYS } from '../types';
import { dayKey, startOf, endOf, hhmm, toTimeInput } from '../lib/calendar-geometry';
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
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function eventColor(ev: CalendarEventLike): string {
  return ev.color || 'var(--quant-warning)';
}

export function CalendarWeekView({
  events,
  holidaysByDay = {},
  selectedDate,
  onSelectDate,
  openDedicatedSheet,
  onSelectEvent,
  weekStartsOn = 1,
  className = '',
}: CalendarWeekViewProps) {
  const today = useMemo(() => new Date(), []);
  const todayKey = dayKey(today);
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
          if (dayKey(s) === dayKey(day)) allDay[di].push(ev);
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

  // ---- current time ----------------------------------------------------
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);
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
    const y = e.clientY - rect.top;
    const raw = Math.round((y / WEEK_HOUR_HEIGHT) * 60);
    const snapped = Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES;
    return Math.max(0, Math.min(DAY_MINUTES, snapped));
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
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[var(--quant-muted-foreground)] hover:text-white hover:bg-[var(--quant-surface-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-warning)]"
          >
            <ChevronLeftIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={goNextWeek}
            aria-label="Next week"
            data-testid="week-next"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[var(--quant-muted-foreground)] hover:text-white hover:bg-[var(--quant-surface-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-warning)]"
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
          className="min-h-[44px] px-4 rounded-lg text-xs font-medium text-[var(--quant-muted-foreground)] hover:text-white hover:bg-[var(--quant-surface-elevated)] border border-[#232938] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-warning)]"
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
                  className="flex-1 min-w-0 flex flex-col items-center py-2 gap-0.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-warning)] hover:bg-[#101218]"
                >
                  <span className={`text-[10px] font-medium uppercase tracking-wide ${isToday ? 'text-[var(--quant-warning)]' : 'text-[var(--quant-muted-foreground)]'}`}>
                    {weekdayNames[i].slice(0, 3)}
                  </span>
                  <span
                    className={`flex items-center justify-center size-8 rounded-full text-sm font-semibold ${
                      isToday
                        ? 'bg-[var(--quant-warning)] text-black shadow-[0_0_12px_rgba(245,158,11,0.4)]'
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
                      className="w-full truncate text-left text-[11px] px-1.5 py-0.5 rounded border-l-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-warning)]"
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
                    aria-label={`${weekdayNames[di]} time slots. Activate to create an event.`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') openDedicatedSheet('event', day);
                    }}
                    onPointerDown={handleColumnPointerDown(di)}
                    onPointerMove={handleColumnPointerMove}
                    onPointerUp={() => finishDrag(di)}
                    onPointerCancel={() => setDrag(null)}
                    data-testid={`week-day-column-${di}`}
                    className="flex-1 min-w-0 relative border-l border-[#232938]/40 cursor-crosshair focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--quant-warning)]"
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
                        className="absolute left-1 right-1 z-[5] rounded bg-[var(--quant-warning)]/25 border border-[var(--quant-warning)]/60 pointer-events-none"
                        style={{ top: minutesToTop(dragLo), height: Math.max(14, minutesToTop(dragHi) - minutesToTop(dragLo)) }}
                        data-testid="week-drag-highlight"
                        aria-hidden="true"
                      />
                    )}

                    {/* Events */}
                    {timedByDay[di].map((p) => {
                      const color = eventColor(p.event);
                      const widthPct = 100 / p.colCount;
                      return (
                        <button
                          key={p.event.id}
                          type="button"
                          data-week-event
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectEvent(p.event);
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          title={`${p.event.title} · ${hhmm(startOf(p.event))} – ${hhmm(endOf(p.event))}`}
                          data-testid={`week-event-${p.event.id}`}
                          className="absolute z-[4] text-left rounded-md border-l-[3px] px-1.5 py-0.5 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white hover:brightness-125 transition"
                          style={{
                            top: p.top + 1,
                            height: Math.max(22, p.height - 2),
                            left: `calc(${(p.col * widthPct).toFixed(2)}% + 2px)`,
                            width: `calc(${widthPct.toFixed(2)}% - 4px)`,
                            borderLeftColor: color,
                            backgroundColor: `${color}2e`,
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
