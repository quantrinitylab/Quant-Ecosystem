'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Button, Modal, Skeleton, ErrorState } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
import { useCalendarEvents, useCreateEvent, useDeleteEvent } from '../../hooks/useCalendar';
import { holidaysForMonth, type Holiday, HOLIDAYS } from '../../lib/holidays';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const FULL_WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface CalendarEventLike {
  id: string;
  title: string;
  startTime?: string;
  endTime?: string;
  start?: string;
  end?: string;
  location?: string;
  description?: string;
  allDay?: boolean;
}

const startOf = (event: CalendarEventLike) => new Date(event.startTime ?? event.start ?? '');
const endOf = (event: CalendarEventLike) => new Date(event.endTime ?? event.end ?? '');
const hhmm = (date: Date) =>
  Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const toLocalInput = (date: Date) =>
  `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}T${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}`;

const DURATION_PRESETS = [
  { label: '30 min', minutes: 30 },
  { label: '1 hr', minutes: 60 },
  { label: '2 hrs', minutes: 120 },
];

type AgendaDay = { key: string; date: Date; events: CalendarEventLike[]; holidays: Holiday[] };

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;

export default function CalendarPage() {
  const today = new Date();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number>(today.getDate());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [gridOpen, setGridOpen] = useState(true);
  const [newEvent, setNewEvent] = useState({
    title: '',
    startTime: '',
    endTime: '',
    location: '',
    description: '',
    allDay: false,
  });
  const scrollHostRef = useRef<HTMLDivElement>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const start = new Date(year, 0, 1).toISOString();
  const end = new Date(year, 11, 31, 23, 59, 59).toISOString();

  const { data: events, isLoading, error, refetch } = useCalendarEvents({ start, end });
  const createEvent = useCreateEvent();
  const deleteEvent = useDeleteEvent();

  const grid = useMemo(() => {
    const total = new Date(year, month + 1, 0).getDate();
    const offset = new Date(year, month, 1).getDay();
    const prevMonthTotal = new Date(year, month, 0).getDate();
    return { total, offset, prevMonthTotal, trailing: (7 - ((offset + total) % 7)) % 7 };
  }, [year, month]);

  const holidays = useMemo(() => holidaysForMonth(year, month), [year, month]);

  const eventsByDay = useMemo(() => {
    const map: Record<number, CalendarEventLike[]> = {};
    for (const event of (events ?? []) as unknown as CalendarEventLike[]) {
      const date = startOf(event);
      if (Number.isNaN(date.getTime())) continue;
      if (date.getFullYear() !== year || date.getMonth() !== month) continue;
      const day = date.getDate();
      map[day] = [...(map[day] ?? []), event];
    }
    return map;
  }, [events, year, month]);

  // Full-year agenda with events and Indian holidays
  const agenda = useMemo(() => {
    const map = new Map<string, AgendaDay>();
    const ensure = (input: Date): AgendaDay => {
      const key = dayKey(input);
      let day = map.get(key);
      if (!day) {
        day = {
          key,
          date: new Date(input.getFullYear(), input.getMonth(), input.getDate()),
          events: [],
          holidays: [],
        };
        map.set(key, day);
      }
      return day;
    };

    // Ensure current month days exist in agenda
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      ensure(new Date(year, month, d));
    }

    // Add user events
    for (const event of (events ?? []) as unknown as CalendarEventLike[]) {
      const d = startOf(event);
      if (!Number.isNaN(d.getTime())) {
        ensure(d).events.push(event);
      }
    }

    // Add holidays
    for (const holiday of HOLIDAYS) {
      const parts = holiday.date.split('-');
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      ensure(d).holidays.push(holiday);
    }

    const list = Array.from(map.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
    return list;
  }, [events, year, month]);

  const goMonth = useCallback((delta: number) => {
    setCurrentDate((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }, []);

  const goToday = useCallback(() => {
    const now = new Date();
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDay(now.getDate());
    const target = scrollHostRef.current?.querySelector(`[data-agenda-key="${dayKey(now)}"]`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const openCreate = useCallback(
    (day?: number) => {
      const base = new Date(year, month, day ?? selectedDay, 10, 0, 0);
      const later = new Date(base.getTime() + 60 * 60 * 1000);
      setNewEvent({
        title: '',
        startTime: toLocalInput(base),
        endTime: toLocalInput(later),
        location: '',
        description: '',
        allDay: false,
      });
      setShowCreateModal(true);
    },
    [year, month, selectedDay],
  );

  useEffect(() => {
    const handler = () => openCreate();
    window.addEventListener('quant:calendar:create', handler);
    return () => window.removeEventListener('quant:calendar:create', handler);
  }, [openCreate]);

  const selectDayFromGrid = useCallback(
    (day: number) => {
      setSelectedDay(day);
      const key = dayKey(new Date(year, month, day));
      const target = scrollHostRef.current?.querySelector(`[data-agenda-key="${key}"]`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [year, month],
  );

  const handleCreateEvent = useCallback(async () => {
    if (!newEvent.title.trim() || !newEvent.startTime || !newEvent.endTime) return;
    const payload = newEvent.allDay
      ? {
          title: newEvent.title.trim(),
          startTime: new Date(`${newEvent.startTime.slice(0, 10)}T00:00:00`).toISOString(),
          endTime: new Date(`${newEvent.endTime.slice(0, 10)}T23:59:59`).toISOString(),
          description: newEvent.description,
          location: newEvent.location,
          allDay: true,
        }
      : {
          title: newEvent.title.trim(),
          startTime: new Date(newEvent.startTime).toISOString(),
          endTime: new Date(newEvent.endTime).toISOString(),
          description: newEvent.description,
          location: newEvent.location,
        };
    await createEvent.mutateAsync(payload as never);
    setShowCreateModal(false);
  }, [newEvent, createEvent]);

  const monthName = MONTH_NAMES[month];

  return (
    <AppShell
      sidebar={<AppSidebar />}
      theme="dark"
      className="quantmail-shell"
      mobileTitle={
        <div className="flex items-center gap-2">
          <h1 className="text-base font-bold text-[var(--quant-foreground)]">
            {monthName} {year}
          </h1>
        </div>
      }
      mobileActions={
        <button
          type="button"
          onClick={goToday}
          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-[var(--quant-surface-hover)] border border-[var(--quant-border)] text-[#ff9933]"
        >
          Today
        </button>
      }
    >
      <PageTransition className="workspace-page calendar-workspace flex flex-col h-full bg-[#0a0a0c]">
        {/* Desktop Calendar Toolbar */}
        <div className="hidden lg:flex items-center justify-between border-b border-[var(--quant-border)] px-6 py-3.5 bg-[var(--quant-surface)]">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => goMonth(-1)}
              aria-label="Previous month"
              className="size-8 grid place-items-center rounded-lg border border-[var(--quant-border)] text-[var(--quant-muted-foreground)] hover:text-white hover:bg-[var(--quant-surface-hover)] transition-colors"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => goMonth(1)}
              aria-label="Next month"
              className="size-8 grid place-items-center rounded-lg border border-[var(--quant-border)] text-[var(--quant-muted-foreground)] hover:text-white hover:bg-[var(--quant-surface-hover)] transition-colors"
            >
              ›
            </button>
            <h2 className="text-xl font-bold tracking-tight text-[var(--quant-foreground)]">
              {monthName}{' '}
              <span className="text-[var(--quant-muted-foreground)] font-normal">{year}</span>
            </h2>
            <button
              type="button"
              onClick={goToday}
              className="ml-2 px-3 py-1 text-xs font-semibold rounded-lg border border-[var(--quant-border)] text-[var(--quant-muted-foreground)] hover:text-white hover:border-[#ff9933]/60 transition-colors"
            >
              Today
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setGridOpen((open) => !open)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--quant-border)] text-[var(--quant-muted-foreground)] hover:text-white transition-colors"
            >
              {gridOpen ? 'Hide Month Grid' : 'Show Month Grid'}
            </button>
            <Button variant="primary" onClick={() => openCreate()}>
              + New Event
            </Button>
          </div>
        </div>

        {/* Collapsible Month Grid (Outlook & Google Calendar style) */}
        {gridOpen && (
          <div className="border-b border-[var(--quant-border)] bg-[var(--quant-surface-subtle)] px-4 py-3 sm:px-6">
            {/* Mobile Month Header with Chevrons */}
            <div className="flex lg:hidden items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goMonth(-1)}
                  className="size-7 grid place-items-center rounded border border-[var(--quant-border)] text-xs text-[var(--quant-muted-foreground)]"
                >
                  ‹
                </button>
                <span className="text-sm font-bold text-white">
                  {monthName} {year}
                </span>
                <button
                  type="button"
                  onClick={() => goMonth(1)}
                  className="size-7 grid place-items-center rounded border border-[var(--quant-border)] text-xs text-[var(--quant-muted-foreground)]"
                >
                  ›
                </button>
              </div>
              <button
                type="button"
                onClick={() => setGridOpen(false)}
                className="text-xs text-[var(--quant-muted-foreground)] hover:text-white"
              >
                Collapse ▴
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAYS.map((d, i) => (
                <div
                  key={i}
                  className={`text-[11px] font-bold pb-1 uppercase tracking-wider ${
                    i === 0 || i === 6 ? 'text-zinc-500' : 'text-zinc-400'
                  }`}
                >
                  {d}
                </div>
              ))}

              {/* Offset days from previous month */}
              {Array.from({ length: grid.offset }).map((_, i) => {
                const prevDay = grid.prevMonthTotal - grid.offset + i + 1;
                return (
                  <div
                    key={`prev-${i}`}
                    className="h-9 sm:h-11 flex flex-col items-center justify-center text-xs text-zinc-600 rounded-lg select-none"
                  >
                    {prevDay}
                  </div>
                );
              })}

              {/* Current month days */}
              {Array.from({ length: grid.total }).map((_, i) => {
                const day = i + 1;
                const isSelected = day === selectedDay;
                const isToday =
                  today.getDate() === day &&
                  today.getMonth() === month &&
                  today.getFullYear() === year;
                const dayHolidays = holidays[day] ?? [];
                const dayEvents = eventsByDay[day] ?? [];
                const hasHoliday = dayHolidays.length > 0;
                const hasEvent = dayEvents.length > 0;

                return (
                  <button
                    key={`day-${day}`}
                    type="button"
                    onClick={() => selectDayFromGrid(day)}
                    className={`group relative h-9 sm:h-11 flex flex-col items-center justify-center rounded-xl text-xs font-semibold transition-all ${
                      isSelected
                        ? 'bg-[#ff9933] text-[#191008] shadow-md scale-105 z-10'
                        : isToday
                          ? 'border border-[#ff9933] text-white hover:bg-[var(--quant-surface-hover)]'
                          : 'text-zinc-300 hover:bg-[var(--quant-surface-hover)]'
                    }`}
                  >
                    <span>{day}</span>
                    {/* Indicators for events & Indian festivals */}
                    <div className="flex items-center gap-0.5 mt-0.5">
                      {hasHoliday && (
                        <span
                          className={`size-1 rounded-full ${
                            isSelected ? 'bg-[#191008]' : 'bg-emerald-400'
                          }`}
                        />
                      )}
                      {hasEvent && (
                        <span
                          className={`size-1 rounded-full ${
                            isSelected ? 'bg-[#191008]' : 'bg-[#ff9933]'
                          }`}
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Collapse / Expand Drag Handle */}
            <div className="flex justify-center mt-2">
              <button
                type="button"
                onClick={() => setGridOpen(false)}
                className="w-12 h-1 rounded-full bg-zinc-700 hover:bg-zinc-500 transition-colors"
                aria-label="Collapse month calendar"
              />
            </div>
          </div>
        )}

        {/* Agenda / Schedule Timeline Stream */}
        <div
          ref={scrollHostRef}
          className="flex-1 overflow-y-auto px-4 py-4 sm:px-8 sm:py-6 space-y-6"
        >
          {/* Monthly Seasonal Header Card (Google Calendar style from user screenshot) */}
          <div className="relative overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-gradient-to-br from-[#12171f] via-[#1a141c] to-[#1e130c] p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#ff9933]">
                  QuantMail Calendar · Bharat Edition
                </span>
                <h3 className="text-2xl font-extrabold text-white mt-1">
                  {monthName} {year}
                </h3>
                <p className="text-xs text-[var(--quant-muted-foreground)] mt-1">
                  Synchronized with national holidays, Indian festivals, and your email schedules.
                </p>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Sync
                </span>
              </div>
            </div>
          </div>

          {isLoading && (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} variant="rect" width="100%" height="80px" />
              ))}
            </div>
          )}

          {error && <ErrorState message={error.message} onRetry={() => void refetch()} />}

          {!isLoading && !error && (
            <div className="space-y-6">
              {agenda.map((item) => {
                const isItemToday =
                  today.getDate() === item.date.getDate() &&
                  today.getMonth() === item.date.getMonth() &&
                  today.getFullYear() === item.date.getFullYear();
                const isSelected =
                  item.date.getDate() === selectedDay && item.date.getMonth() === month;
                const weekdayName = FULL_WEEKDAYS[item.date.getDay()];
                const dayNum = item.date.getDate();
                const monthShort = MONTH_NAMES[item.date.getMonth()].slice(0, 3);
                const hasContent = item.events.length > 0 || item.holidays.length > 0;

                return (
                  <div
                    key={item.key}
                    data-agenda-key={item.key}
                    className={`transition-all duration-200 ${
                      isSelected ? 'ring-1 ring-[#ff9933]/50 rounded-2xl p-2 bg-[#ff9933]/5' : ''
                    }`}
                  >
                    {/* Date Heading */}
                    <div className="flex items-center gap-3 mb-2.5">
                      <div
                        className={`size-10 flex-none rounded-xl font-bold flex items-center justify-center text-sm shadow-md ${
                          isItemToday
                            ? 'bg-[#ff9933] text-[#191008]'
                            : 'bg-[var(--quant-surface-hover)] border border-[var(--quant-border)] text-white'
                        }`}
                      >
                        {dayNum}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">
                          {weekdayName}, {monthShort} {dayNum}
                        </h4>
                        <span className="text-[10px] uppercase font-semibold tracking-wider text-[var(--quant-muted-foreground)]">
                          {isItemToday ? 'Today' : 'Upcoming'}
                        </span>
                      </div>
                    </div>

                    {/* Day Content: Holidays & User Events */}
                    <div className="ml-13 pl-3 border-l border-zinc-800 space-y-2.5">
                      {item.holidays.map((h, hi) => (
                        <div
                          key={`h-${hi}`}
                          className="flex items-center justify-between p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-950/20 text-emerald-300 shadow-sm"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-base">🪔</span>
                            <div>
                              <strong className="block text-xs font-bold text-emerald-200">
                                {h.name}
                              </strong>
                              {h.description && (
                                <p className="text-[11px] text-emerald-400/80">{h.description}</p>
                              )}
                            </div>
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                            {h.kind}
                          </span>
                        </div>
                      ))}

                      {item.events.map((evt) => (
                        <div
                          key={evt.id}
                          className="flex items-center justify-between p-3.5 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] hover:border-[#ff9933]/50 transition-colors shadow-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <strong className="block text-xs font-bold text-white truncate">
                              {evt.title}
                            </strong>
                            <div className="flex items-center gap-3 mt-1 text-[11px] text-[var(--quant-muted-foreground)]">
                              <span>
                                {evt.allDay
                                  ? 'All day'
                                  : `${hhmm(startOf(evt))} – ${hhmm(endOf(evt))}`}
                              </span>
                              {evt.location && <span>📍 {evt.location}</span>}
                            </div>
                            {evt.description && (
                              <p className="text-[11px] text-zinc-400 mt-1 line-clamp-1">
                                {evt.description}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => deleteEvent.mutate(evt.id)}
                            className="text-xs text-rose-400/80 hover:text-rose-300 px-2 py-1"
                            title="Delete event"
                          >
                            ✕
                          </button>
                        </div>
                      ))}

                      {!hasContent && (
                        <div className="flex items-center justify-between py-2 text-xs text-zinc-500">
                          <span>No plans scheduled.</span>
                          <button
                            type="button"
                            onClick={() => openCreate(dayNum)}
                            className="text-[11px] text-[#ff9933] hover:underline font-semibold"
                          >
                            + Add plan
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Create Event Modal */}
        <Modal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title="Create New Event"
        >
          <div className="space-y-4 p-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Event Title *
              </label>
              <input
                type="text"
                value={newEvent.title}
                onChange={(e) => setNewEvent((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="e.g. Product Review, Standup, Investor Call…"
                className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff9933]"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newEvent.allDay}
                  onChange={(e) => setNewEvent((prev) => ({ ...prev, allDay: e.target.checked }))}
                  className="accent-[#ff9933]"
                />
                All Day Event
              </label>
              <div className="flex items-center gap-1.5">
                {DURATION_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      const startAt = new Date(newEvent.startTime);
                      if (!Number.isNaN(startAt.getTime())) {
                        setNewEvent((prev) => ({
                          ...prev,
                          endTime: toLocalInput(
                            new Date(startAt.getTime() + preset.minutes * 60000),
                          ),
                        }));
                      }
                    }}
                    className="px-2 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-300 hover:bg-zinc-700"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Start Time
                </label>
                <input
                  type={newEvent.allDay ? 'date' : 'datetime-local'}
                  value={newEvent.allDay ? newEvent.startTime.slice(0, 10) : newEvent.startTime}
                  onChange={(e) => setNewEvent((prev) => ({ ...prev, startTime: e.target.value }))}
                  className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#ff9933]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">End Time</label>
                <input
                  type={newEvent.allDay ? 'date' : 'datetime-local'}
                  value={newEvent.allDay ? newEvent.endTime.slice(0, 10) : newEvent.endTime}
                  onChange={(e) => setNewEvent((prev) => ({ ...prev, endTime: e.target.value }))}
                  className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#ff9933]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Location (Optional)
              </label>
              <input
                type="text"
                value={newEvent.location}
                onChange={(e) => setNewEvent((prev) => ({ ...prev, location: e.target.value }))}
                placeholder="Google Meet, Zoom, or Office Room…"
                className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff9933]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Description / Notes
              </label>
              <textarea
                value={newEvent.description}
                onChange={(e) => setNewEvent((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Meeting agenda, links, notes…"
                rows={3}
                className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg p-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff9933]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleCreateEvent()}
                disabled={!newEvent.title.trim() || createEvent.isPending}
              >
                {createEvent.isPending ? 'Saving…' : 'Save Event'}
              </Button>
            </div>
          </div>
        </Modal>
      </PageTransition>
    </AppShell>
  );
}
