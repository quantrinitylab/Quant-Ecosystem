'use client';

/**
 * Calendar Day view — the real single-day view behind the bottom nav's "Day"
 * tab and the desktop "Day" tab (approved structure 2026-10-09: Calendar is
 * Day · Week · Month, real view modes).
 *
 * Before this, ?tab=day rendered the multi-day Chronological Feed, so the
 * "Day" tab showed 30 days of cards. Layout follows the approved prototype:
 * day title + count, a Mon–Sun strip with event dots, then agenda rows (time
 * column, accent bar, title, where/who, guest initials, a "Now" badge) and an
 * honest "Free day" empty state. On wide screens a mini month and "Up next"
 * sit beside it.
 *
 * Pure presentation: events come from the page's GET /events window
 * (useCalendarEvents), selection is the page's selectedDate, and creation
 * goes through the page's openDedicatedSheet — no data of its own.
 */

import React, { useEffect, useMemo, useState } from 'react';
import type { CalendarEventLike, EntryType } from '../types';
import { FULL_WEEKDAYS, MONTH_NAMES, MONTHS_SHORT } from '../types';
import { dayKey, endOf, startOf } from '../lib/calendar-geometry';
import {
  attendeeIdentity,
  clockTime,
  durationLabel,
  hueFor,
  longDayLabel,
  plural,
  relativeDayLabel,
  weekdayMonthDay,
} from '../lib/calendar-copy';
import { useMinuteClock } from '../lib/use-minute-clock';
import type { Holiday } from '../../../lib/holidays';
import { weekStartOf } from './CalendarWeekView';
import {
  IconCake,
  IconCalendar,
  IconCheckCircle,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconDroplet,
  IconFlag,
  IconMapPin,
  IconPlus,
  IconUsers,
  IconVideoCall,
} from '../../../components/icons';

const WEEKDAY_SHORT_MON_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MINI_WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * Events that touch `day`: starting on it, or spanning across it (multi-day
 * timed events and multi-day all-day entries). All-day first, then by start.
 */
export function eventsForDay(events: CalendarEventLike[], day: Date): CalendarEventLike[] {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = addDays(day, 1).getTime();
  const key = dayKey(day);
  return events
    .filter((ev) => {
      const s = startOf(ev);
      if (Number.isNaN(s.getTime())) return false;
      if (dayKey(s) === key) return true;
      const e = endOf(ev);
      if (Number.isNaN(e.getTime())) return false;
      return s.getTime() < dayEnd && e.getTime() > dayStart;
    })
    .sort((a, b) => {
      if (Boolean(a.allDay) !== Boolean(b.allDay)) return a.allDay ? -1 : 1;
      return (
        startOf(a).getTime() - startOf(b).getTime() || (a.title || '').localeCompare(b.title || '')
      );
    });
}

function isLink(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function linkHost(value: string): string {
  try {
    return new URL(value.trim()).host;
  } catch {
    return value;
  }
}

function barColorFor(ev: CalendarEventLike): string {
  if (ev.color && ev.color !== 'var(--app-accent)') return ev.color;
  if (ev.type === 'task') return '#F59E0B';
  if (ev.type === 'birthday') return '#34D399';
  if (ev.type === 'period') return '#FB7185';
  return 'var(--app-accent)';
}

interface RowTime {
  top: string;
  bottom: string;
  /** Screen-reader phrasing of the same range. */
  spoken: string;
}

function rowTime(ev: CalendarEventLike, day: Date): RowTime {
  const s = startOf(ev);
  const e = endOf(ev);
  if (ev.allDay) return { top: 'All day', bottom: '', spoken: 'all day' };
  const key = dayKey(day);
  const hasEnd = !Number.isNaN(e.getTime());
  const startsToday = dayKey(s) === key;
  const endsToday = hasEnd && dayKey(e) === key;
  if (!startsToday) {
    // Continues from an earlier day.
    const end = hasEnd ? clockTime(e) : '';
    return { top: 'Until', bottom: end, spoken: end ? `until ${end}` : 'continues from an earlier day' };
  }
  const start = clockTime(s);
  if (!hasEnd) return { top: start, bottom: '', spoken: `at ${start}` };
  if (endsToday) {
    const end = clockTime(e);
    return { top: start, bottom: end, spoken: `${start} to ${end}` };
  }
  const endDay = WEEKDAY_SHORT_MON_FIRST[(e.getDay() + 6) % 7];
  return {
    top: start,
    bottom: `→ ${endDay}`,
    spoken: `${start} to ${FULL_WEEKDAYS[e.getDay()]} ${clockTime(e)}`,
  };
}

function Subline({ ev }: { ev: CalendarEventLike }) {
  const location = (ev.location || '').trim();
  const people = Array.isArray(ev.attendees) ? ev.attendees.length : 0;
  let icon: React.ReactNode;
  let text: string;
  if (location) {
    if (isLink(location)) {
      icon = <IconVideoCall size={14} className="shrink-0" />;
      text = linkHost(location);
    } else {
      icon = <IconMapPin size={14} className="shrink-0" />;
      text = location;
    }
  } else if (people > 0) {
    icon = <IconUsers size={14} className="shrink-0" />;
    text = plural(people, 'guest');
  } else if (ev.type === 'task') {
    icon = <IconCheckCircle size={14} className="shrink-0" />;
    text = ev.priority ? `Task · ${ev.priority} priority` : 'Task';
  } else if (ev.type === 'birthday') {
    icon = <IconCake size={14} className="shrink-0" />;
    text = 'Birthday';
  } else if (ev.type === 'period') {
    icon = <IconDroplet size={14} className="shrink-0" />;
    text = 'Cycle log';
  } else {
    const s = startOf(ev);
    const e = endOf(ev);
    icon = <IconClock size={14} className="shrink-0" />;
    text = ev.allDay ? 'All day' : durationLabel(s, e) || 'Event';
  }
  return (
    <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12.5px] text-[var(--quant-muted-foreground)]">
      {icon}
      <span className="truncate">{text}</span>
    </span>
  );
}

function GuestInitials({ ev }: { ev: CalendarEventLike }) {
  const people = (Array.isArray(ev.attendees) ? (ev.attendees as unknown[]) : [])
    .map((a) => attendeeIdentity(a as never))
    .filter((p): p is NonNullable<typeof p> => p !== null);
  if (people.length === 0) return null;
  const shown = people.slice(0, 3);
  const extra = people.length - shown.length;
  return (
    <span className="flex shrink-0 items-center" aria-hidden="true" data-testid="calendar-day-event-guests">
      {shown.map((p, i) => (
        <span
          key={p.key}
          title={p.label}
          className={`grid size-6 place-items-center rounded-full text-[10px] font-semibold tracking-wide text-white shadow-[0_0_0_2px_var(--quant-background)] ${i > 0 ? '-ml-2' : ''}`}
          style={{ background: `hsl(${hueFor(p.key)} 55% 42%)` }}
        >
          {p.initials}
        </span>
      ))}
      {extra > 0 && (
        <span className="-ml-2 grid size-6 place-items-center rounded-full bg-[var(--quant-surface-elevated)] text-[10px] font-semibold text-[var(--quant-foreground)] shadow-[0_0_0_2px_var(--quant-background)]">
          +{extra}
        </span>
      )}
    </span>
  );
}

function DayEventRow({
  ev,
  day,
  now,
  onSelectEvent,
}: {
  ev: CalendarEventLike;
  day: Date;
  now: Date;
  onSelectEvent: (event: CalendarEventLike) => void;
}) {
  const s = startOf(ev);
  const e = endOf(ev);
  const isNow =
    !ev.allDay &&
    !Number.isNaN(e.getTime()) &&
    now.getTime() >= s.getTime() &&
    now.getTime() < e.getTime();
  const time = rowTime(ev, day);
  const bar = barColorFor(ev);
  const title = ev.title?.trim() || '(No title)';
  const guests = Array.isArray(ev.attendees) ? ev.attendees.length : 0;
  const label = `${title}, ${time.spoken}${guests ? `, ${plural(guests, 'guest')}` : ''}${isNow ? ', happening now' : ''}`;

  return (
    <button
      type="button"
      onClick={() => onSelectEvent(ev)}
      aria-label={label}
      data-testid="calendar-day-event"
      data-now={isNow ? 'true' : undefined}
      className={`relative flex w-full items-center gap-3 rounded-[18px] border px-3.5 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] ${
        isNow
          ? 'border-[color-mix(in_srgb,var(--app-accent)_35%,transparent)] bg-[linear-gradient(90deg,color-mix(in_srgb,var(--app-accent)_14%,transparent),rgba(255,255,255,0.02)_70%)]'
          : 'border-white/[0.07] bg-white/[0.025] hover:bg-white/[0.05]'
      }`}
    >
      <span className="w-[68px] shrink-0 whitespace-nowrap text-right tabular-nums" aria-hidden="true">
        <span className="block text-[13px] font-semibold text-[var(--quant-foreground)]">{time.top}</span>
        {time.bottom && (
          <span className="block text-[11.5px] text-[var(--quant-muted-foreground)]">{time.bottom}</span>
        )}
      </span>
      <span
        aria-hidden="true"
        className="w-[3px] self-stretch rounded-full"
        style={{ background: bar, boxShadow: `0 0 10px ${bar}` }}
      />
      <span className="min-w-0 flex-1" aria-hidden="true">
        <span
          className={`block truncate text-sm font-semibold ${
            ev.completed ? 'text-[var(--quant-muted-foreground)] line-through' : 'text-[var(--quant-foreground)]'
          }`}
        >
          {title}
        </span>
        <Subline ev={ev} />
      </span>
      <GuestInitials ev={ev} />
      {isNow && (
        <span
          aria-hidden="true"
          className="absolute -top-2 right-3 rounded-full bg-[var(--app-accent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-white"
        >
          Now
        </span>
      )}
    </button>
  );
}

function MiniMonth({
  selectedDate,
  today,
  countsByKey,
  onSelectDate,
}: {
  selectedDate: Date;
  today: Date;
  countsByKey: Map<string, number>;
  onSelectDate: (date: Date) => void;
}) {
  const [viewMonth, setViewMonth] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
  );
  // Follow the selection when it moves to another month (header steppers, strip).
  useEffect(() => {
    setViewMonth((cur) =>
      cur.getFullYear() === selectedDate.getFullYear() && cur.getMonth() === selectedDate.getMonth()
        ? cur
        : new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
    );
  }, [selectedDate]);

  const cells = useMemo(() => {
    const first = weekStartOf(viewMonth, 1);
    return Array.from({ length: 42 }, (_, i) => addDays(first, i));
  }, [viewMonth]);
  const selectedKey = dayKey(selectedDate);
  const todayKey = dayKey(today);

  return (
    <div
      className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3"
      data-testid="calendar-day-mini-month"
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--quant-muted-foreground)]">
          {MONTH_NAMES[viewMonth.getMonth()]} {viewMonth.getFullYear()}
        </span>
        <span className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label="Show previous month"
            onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
            className="grid size-8 place-items-center rounded-lg text-[var(--quant-muted-foreground)] hover:bg-white/[0.06] hover:text-[var(--quant-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
          >
            <IconChevronLeft size={14} />
          </button>
          <button
            type="button"
            aria-label="Show next month"
            onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
            className="grid size-8 place-items-center rounded-lg text-[var(--quant-muted-foreground)] hover:bg-white/[0.06] hover:text-[var(--quant-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
          >
            <IconChevronRight size={14} />
          </button>
        </span>
      </div>
      <div
        className="grid grid-cols-7 text-center text-[10.5px] font-semibold text-[var(--quant-muted-foreground)]"
        aria-hidden="true"
      >
        {MINI_WEEKDAYS.map((d, i) => (
          <span key={`${d}-${i}`} className="py-1">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((d) => {
          const k = dayKey(d);
          const inMonth = d.getMonth() === viewMonth.getMonth();
          const isSelected = k === selectedKey;
          const isToday = k === todayKey;
          const count = countsByKey.get(k) ?? 0;
          return (
            <button
              key={k}
              type="button"
              onClick={() => onSelectDate(d)}
              aria-label={`${longDayLabel(d)}${count ? `, ${plural(count, 'event')}` : ''}`}
              aria-pressed={isSelected}
              aria-current={isToday ? 'date' : undefined}
              className={`relative mx-auto grid size-9 place-items-center rounded-xl text-xs tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] ${
                isSelected
                  ? 'bg-[var(--app-accent)] font-semibold text-white'
                  : isToday
                    ? 'font-semibold text-[var(--app-accent)] hover:bg-white/[0.06]'
                    : inMonth
                      ? 'text-[var(--quant-foreground)] hover:bg-white/[0.06]'
                      : 'text-[var(--quant-muted-foreground)]/50 hover:bg-white/[0.04]'
              }`}
            >
              {d.getDate()}
              {count > 0 && (
                <span
                  aria-hidden="true"
                  className={`absolute bottom-1 size-1 rounded-full ${isSelected ? 'bg-white' : 'bg-[var(--app-accent)]'}`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface CalendarDayViewProps {
  events: CalendarEventLike[];
  holidaysByDay?: Record<string, Holiday[]>;
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  openDedicatedSheet: (type: EntryType, date?: Date) => void;
  onSelectEvent: (event: CalendarEventLike) => void;
  /** Initial load still pending — never show "Free day" for an unloaded day. */
  isLoading?: boolean;
  className?: string;
}

export function CalendarDayView({
  events,
  holidaysByDay = {},
  selectedDate,
  onSelectDate,
  openDedicatedSheet,
  onSelectEvent,
  isLoading = false,
  className = '',
}: CalendarDayViewProps) {
  const now = useMinuteClock();
  const day = useMemo(() => startOfDay(selectedDate), [selectedDate]);
  const key = dayKey(day);

  const dayEvents = useMemo(() => eventsForDay(events, day), [events, day]);
  const holidays = holidaysByDay[key] ?? [];

  const weekDays = useMemo(() => {
    const ws = weekStartOf(day, 1);
    return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  }, [day]);

  // Per-day counts by start day — drives the strip / mini-month dots.
  const countsByKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const ev of events) {
      const s = startOf(ev);
      if (Number.isNaN(s.getTime())) continue;
      const k = dayKey(s);
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [events]);

  const upNext = useMemo(
    () =>
      events
        .filter((ev) => {
          const s = startOf(ev);
          return !Number.isNaN(s.getTime()) && s.getTime() > now.getTime();
        })
        .sort((a, b) => startOf(a).getTime() - startOf(b).getTime())
        .slice(0, 3),
    [events, now],
  );

  const relative = relativeDayLabel(day, now);
  const summaryParts = [dayEvents.length ? plural(dayEvents.length, 'event') : 'No events'];
  if (holidays.length) summaryParts.push(holidays.map((h) => h.name).join(', '));
  const todayKey = dayKey(now);

  return (
    <div
      role="tabpanel"
      id="subview-day"
      aria-labelledby="tab-day"
      data-testid="calendar-day-view"
      className={`flex-1 min-h-0 overflow-y-auto bg-[var(--quant-background)] px-4 pb-28 pt-4 text-[var(--quant-foreground)] sm:px-6 md:pb-10 ${className}`}
    >
      <div className="mx-auto w-full max-w-5xl lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-6">
        <section aria-label={`Schedule for ${longDayLabel(day)}`} className="min-w-0">
          <div className="flex items-start justify-between gap-3 px-1">
            <div className="min-w-0">
              <h2
                className="truncate text-xl font-bold tracking-tight text-[var(--quant-foreground)]"
                data-testid="calendar-day-title"
              >
                {weekdayMonthDay(day)}
              </h2>
              <p
                className="mt-0.5 truncate text-[13px] text-[var(--quant-muted-foreground)]"
                data-testid="calendar-day-summary"
              >
                {relative && <span className="font-semibold text-[var(--app-accent)]">{relative} · </span>}
                {summaryParts.join(' · ')}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label="Previous day"
                onClick={() => onSelectDate(addDays(day, -1))}
                className="grid size-11 place-items-center rounded-xl border border-white/[0.08] text-[var(--quant-muted-foreground)] transition-colors hover:bg-white/[0.06] hover:text-[var(--quant-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
              >
                <IconChevronLeft size={16} />
              </button>
              <button
                type="button"
                aria-label="Next day"
                onClick={() => onSelectDate(addDays(day, 1))}
                className="grid size-11 place-items-center rounded-xl border border-white/[0.08] text-[var(--quant-muted-foreground)] transition-colors hover:bg-white/[0.06] hover:text-[var(--quant-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
              >
                <IconChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Mon–Sun strip of the selected day's week. */}
          <div
            role="group"
            aria-label={`Week of ${MONTHS_SHORT[weekDays[0]!.getMonth()]} ${weekDays[0]!.getDate()}`}
            className="mt-4 grid grid-cols-7 gap-1.5 sm:gap-2"
            data-testid="calendar-day-strip"
          >
            {weekDays.map((d, i) => {
              const k = dayKey(d);
              const isSelected = k === key;
              const isToday = k === todayKey;
              const count = countsByKey.get(k) ?? 0;
              const hasHoliday = (holidaysByDay[k] ?? []).length > 0;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => onSelectDate(d)}
                  aria-pressed={isSelected}
                  aria-current={isToday ? 'date' : undefined}
                  aria-label={`${FULL_WEEKDAYS[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}${
                    count ? `, ${plural(count, 'event')}` : ''
                  }${hasHoliday ? ', holiday' : ''}`}
                  className={`relative flex h-[66px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] ${
                    isSelected
                      ? 'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--app-accent)_72%,white),var(--app-accent))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_26px_-10px_var(--app-accent)]'
                      : 'bg-white/[0.025] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] hover:bg-white/[0.05]'
                  }`}
                >
                  <span
                    className={`text-[11px] ${
                      isSelected
                        ? 'text-white/85'
                        : isToday
                          ? 'font-semibold text-[var(--app-accent)]'
                          : 'text-[var(--quant-muted-foreground)]'
                    }`}
                  >
                    {WEEKDAY_SHORT_MON_FIRST[i]}
                  </span>
                  <span
                    className={`text-[17px] font-semibold tabular-nums ${
                      isSelected ? 'text-white' : isToday ? 'text-[var(--app-accent)]' : 'text-[var(--quant-foreground)]'
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  {(count > 0 || hasHoliday) && (
                    <span
                      aria-hidden="true"
                      className={`absolute bottom-2 size-1 rounded-full ${
                        isSelected ? 'bg-white' : count > 0 ? 'bg-[var(--app-accent)]' : 'bg-[var(--quant-warning)]'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {holidays.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Holidays">
              {holidays.map((h, i) => (
                <li
                  key={`${h.name}-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--quant-warning)]/25 bg-[var(--quant-warning)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--quant-warning)]"
                >
                  <IconFlag size={13} />
                  <span>{h.name}</span>
                </li>
              ))}
            </ul>
          )}

          {isLoading && dayEvents.length === 0 ? (
            <div role="status" aria-live="polite" className="mt-5 space-y-2.5" data-testid="calendar-day-loading">
              <span className="sr-only">Loading your events…</span>
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[70px] animate-pulse rounded-[18px] bg-white/[0.035]" />
              ))}
            </div>
          ) : dayEvents.length === 0 ? (
            <div
              className="mt-5 flex flex-col items-center rounded-[18px] border border-dashed border-white/[0.09] px-6 py-10 text-center"
              data-testid="calendar-day-empty"
            >
              <span className="mb-3 grid size-14 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--app-accent)_12%,transparent)] text-[var(--app-accent)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--app-accent)_30%,transparent)]">
                <IconCalendar size={24} />
              </span>
              <h3 className="text-base font-semibold text-[var(--quant-foreground)]">Free day</h3>
              <p className="mt-1 text-[13px] text-[var(--quant-muted-foreground)]">
                Nothing on your calendar for {longDayLabel(day)}.
              </p>
              <button
                type="button"
                onClick={() => openDedicatedSheet('event', day)}
                className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[var(--app-accent)] px-4 text-xs font-semibold text-white transition-colors hover:bg-[var(--app-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--quant-background)]"
              >
                <IconPlus size={14} />
                Add event
              </button>
            </div>
          ) : (
            <ul className="mt-5 flex flex-col gap-2.5" aria-label={`Events on ${longDayLabel(day)}`}>
              {dayEvents.map((ev) => (
                <li key={ev.id}>
                  <DayEventRow ev={ev} day={day} now={now} onSelectEvent={onSelectEvent} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="hidden space-y-4 lg:block" aria-label="Month overview">
          <MiniMonth selectedDate={day} today={now} countsByKey={countsByKey} onSelectDate={onSelectDate} />
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3">
            <h3 className="px-1 pb-2 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--quant-muted-foreground)]">
              Up next
            </h3>
            {upNext.length === 0 ? (
              <p className="px-1 pb-1 text-[13px] text-[var(--quant-muted-foreground)]">Nothing else scheduled.</p>
            ) : (
              <ul className="space-y-1">
                {upNext.map((ev) => {
                  const s = startOf(ev);
                  const rel = relativeDayLabel(s, now);
                  const when = `${rel ?? `${MONTHS_SHORT[s.getMonth()]} ${s.getDate()}`}${ev.allDay ? '' : ` · ${clockTime(s)}`}`;
                  return (
                    <li key={ev.id}>
                      <button
                        type="button"
                        onClick={() => onSelectEvent(ev)}
                        className="flex w-full min-w-0 flex-col rounded-xl px-2 py-2 text-left hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
                      >
                        <span className="truncate text-[13px] font-semibold text-[var(--quant-foreground)]">
                          {ev.title?.trim() || '(No title)'}
                        </span>
                        <span className="text-[12px] text-[var(--quant-muted-foreground)]">{when}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
