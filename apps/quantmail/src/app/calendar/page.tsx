'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Button, Modal, Skeleton, ErrorState } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
import { useCalendarEvents, useCreateEvent, useDeleteEvent } from '../../hooks/useCalendar';
import { holidaysForMonth, type Holiday } from '../../lib/holidays';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CalendarEventLike {
  id: string;
  title: string;
  startTime?: string;
  endTime?: string;
  start?: string;
  end?: string;
  location?: string;
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

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

export default function CalendarPage() {
  const today = new Date();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number>(today.getDate());
  const [showCreateModal, setShowCreateModal] = useState(false);
  // Outlook-style (msg#30 P10): the month grid collapses — via the chevron or
  // automatically when you scroll the agenda — leaving the year agenda in focus.
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
  const didAutoScroll = useRef(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  // Fetch the WHOLE year — the agenda below the grid lists past, present and
  // future events like Outlook mobile.
  const start = new Date(year, 0, 1).toISOString();
  const end = new Date(year, 11, 31, 23, 59, 59).toISOString();

  const { data: events, isLoading, error, refetch } = useCalendarEvents({ start, end });
  const createEvent = useCreateEvent();
  const deleteEvent = useDeleteEvent();

  const grid = useMemo(() => {
    const total = new Date(year, month + 1, 0).getDate();
    const offset = new Date(year, month, 1).getDay();
    return { total, offset, trailing: (7 - ((offset + total) % 7)) % 7 };
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
    for (const day of Object.keys(map)) {
      map[Number(day)]!.sort((a, b) => startOf(a).getTime() - startOf(b).getTime());
    }
    return map;
  }, [events, year, month]);

  // Full-year agenda: every day that has events or holidays, in order.
  const agenda = useMemo(() => {
    const map = new Map<string, AgendaDay>();
    const ensure = (input: Date): AgendaDay => {
      const date = new Date(input.getFullYear(), input.getMonth(), input.getDate());
      const key = dayKey(date);
      let entry = map.get(key);
      if (!entry) {
        entry = { key, date, events: [], holidays: [] };
        map.set(key, entry);
      }
      return entry;
    };
    for (const event of (events ?? []) as unknown as CalendarEventLike[]) {
      const date = startOf(event);
      if (Number.isNaN(date.getTime())) continue;
      ensure(date).events.push(event);
    }
    for (let m = 0; m < 12; m++) {
      const monthHolidays = holidaysForMonth(year, m);
      for (const [dayString, list] of Object.entries(monthHolidays)) {
        const date = new Date(year, m, Number(dayString));
        for (const holiday of list ?? []) ensure(date).holidays.push(holiday);
      }
    }
    if (year === today.getFullYear()) ensure(today);
    const days = Array.from(map.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
    for (const day of days) {
      day.events.sort((a, b) => startOf(a).getTime() - startOf(b).getTime());
    }
    return days;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, year]);

  const todayKey = dayKey(today);

  // Auto-scroll the agenda to today once events are in (Outlook behaviour).
  useEffect(() => {
    if (isLoading || didAutoScroll.current) return;
    const target = scrollHostRef.current?.querySelector(`[data-agenda-key="${todayKey}"]`);
    if (target) {
      target.scrollIntoView({ block: 'start' });
      didAutoScroll.current = true;
    }
  }, [isLoading, todayKey, agenda.length]);

  useEffect(() => {
    didAutoScroll.current = false;
  }, [year]);

  const goMonth = useCallback(
    (delta: number) => setCurrentDate(new Date(year, month + delta, 1)),
    [year, month],
  );

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

  // The global contextual FAB (+) dispatches this on /calendar so the
  // bottom-right plus opens this same New event modal.
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

  // Scrolling the agenda collapses the month grid, like Outlook mobile.
  const handleScroll = useCallback(() => {
    const host = scrollHostRef.current;
    if (!host) return;
    if (host.scrollTop > 140 && gridOpen) setGridOpen(false);
  }, [gridOpen]);

  const toggleAllDay = useCallback(() => {
    setNewEvent((prev) => {
      const startDate = prev.startTime.slice(0, 10) || toLocalInput(new Date()).slice(0, 10);
      const endDate = prev.endTime.slice(0, 10) || startDate;
      if (!prev.allDay) {
        return { ...prev, allDay: true, startTime: `${startDate}T00:00`, endTime: `${endDate}T23:59` };
      }
      return { ...prev, allDay: false, startTime: `${startDate}T10:00`, endTime: `${startDate}T11:00` };
    });
  }, []);

  const applyDuration = useCallback((minutes: number) => {
    setNewEvent((prev) => {
      const startAt = new Date(prev.startTime);
      if (Number.isNaN(startAt.getTime())) return prev;
      return { ...prev, endTime: toLocalInput(new Date(startAt.getTime() + minutes * 60000)) };
    });
  }, []);

  const durationLabel = useMemo(() => {
    const startAt = new Date(newEvent.startTime);
    const endAt = new Date(newEvent.endTime);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return '';
    const mins = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
    if (mins <= 0) return '';
    if (mins < 60) return `${mins} min`;
    const hrs = mins / 60;
    return Number.isInteger(hrs) ? `${hrs} hr${hrs > 1 ? 's' : ''}` : `${hrs.toFixed(1)} hrs`;
  }, [newEvent.startTime, newEvent.endTime]);

  const invalidRange = useMemo(() => {
    if (newEvent.allDay) return false;
    const startAt = new Date(newEvent.startTime);
    const endAt = new Date(newEvent.endTime);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return true;
    return endAt.getTime() <= startAt.getTime();
  }, [newEvent.allDay, newEvent.startTime, newEvent.endTime]);

  const handleCreateEvent = useCallback(async () => {
    if (!newEvent.title || !newEvent.startTime || !newEvent.endTime || invalidRange) return;
    const payload = newEvent.allDay
      ? {
          title: newEvent.title,
          startTime: new Date(`${newEvent.startTime.slice(0, 10)}T00:00:00`).toISOString(),
          endTime: new Date(`${newEvent.endTime.slice(0, 10)}T23:59:59`).toISOString(),
          description: newEvent.description,
          location: newEvent.location,
          allDay: true,
        }
      : {
          title: newEvent.title,
          startTime: new Date(newEvent.startTime).toISOString(),
          endTime: new Date(newEvent.endTime).toISOString(),
          description: newEvent.description,
          location: newEvent.location,
        };
    await createEvent.mutateAsync(payload as never);
    setShowCreateModal(false);
  }, [newEvent, invalidRange, createEvent]);

  const monthName = currentDate.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  const selectedDate = new Date(year, month, selectedDay);

  const fieldClasses =
    'w-full rounded-lg border border-[var(--quant-border)] bg-[var(--quant-background)] px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--brand-primary)]/60 focus:ring-2 focus:ring-[var(--brand-primary)]/25';

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <PageTransition className="workspace-page calendar-workspace flex flex-col h-full">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--quant-border)] p-4 sm:flex sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => goMonth(-1)}
              aria-label="Previous month"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--quant-border)] text-[var(--quant-muted-foreground)] transition-colors hover:bg-[var(--quant-muted)]"
            >
              ‹
            </button>
            <button
              onClick={() => goMonth(1)}
              aria-label="Next month"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--quant-border)] text-[var(--quant-muted-foreground)] transition-colors hover:bg-[var(--quant-muted)]"
            >
              ›
            </button>
            <button
              onClick={() => setGridOpen((open) => !open)}
              aria-expanded={gridOpen}
              aria-label={gridOpen ? 'Collapse month grid' : 'Expand month grid'}
              className="flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 transition-colors hover:bg-[var(--quant-muted)]"
            >
              <h1 className="truncate text-lg font-semibold tracking-tight">{monthName}</h1>
              <svg
                viewBox="0 0 24 24"
                className={`h-4 w-4 shrink-0 text-[var(--quant-muted-foreground)] transition-transform ${gridOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <button
              onClick={goToday}
              className="ml-1 shrink-0 rounded-lg border border-[var(--quant-border)] px-2.5 py-1 text-xs font-medium text-[var(--quant-muted-foreground)] transition-colors hover:bg-[var(--quant-muted)]"
            >
              Today
            </button>
          </div>
          <Button variant="primary" onClick={() => openCreate()}>
            Create Event
          </Button>
        </div>

        <div
          ref={scrollHostRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 md:p-6"
        >
          {isLoading && (
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} variant="rect" width="100%" height="96px" />
              ))}
            </div>
          )}
          {error && <ErrorState message={error.message} onRetry={() => void refetch()} />}

          {!isLoading && !error && (
            <>
              {gridOpen && (
                <div className="grid grid-cols-7 gap-1.5">
                  {WEEKDAYS.map((d) => (
                    <div
                      key={d}
                      className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--quant-muted-foreground)]"
                    >
                      {d}
                    </div>
                  ))}

                  {Array.from({ length: grid.offset }).map((_, i) => (
                    <div
                      key={`lead-${i}`}
                      className="min-h-[64px] rounded-xl border border-dashed border-[var(--quant-border)]/50 md:min-h-[92px]"
                    />
                  ))}

                  {Array.from({ length: grid.total }).map((_, i) => {
                    const day = i + 1;
                    const isToday =
                      day === today.getDate() &&
                      month === today.getMonth() &&
                      year === today.getFullYear();
                    const isSelected = day === selectedDay;
                    const dayEvents = eventsByDay[day] ?? [];
                    const dayHolidays = holidays[day] ?? [];
                    const weekend = new Date(year, month, day).getDay() % 6 === 0;

                    return (
                      <button
                        key={day}
                        onClick={() => selectDayFromGrid(day)}
                        onDoubleClick={() => openCreate(day)}
                        className={`flex min-h-[64px] flex-col gap-1 rounded-xl border p-2 text-left transition-all md:min-h-[92px] ${
                          isSelected
                            ? 'border-[var(--brand-primary)]/60 bg-[var(--brand-primary)]/10'
                            : 'border-[var(--quant-border)] hover:border-[var(--brand-primary)]/40 hover:bg-[var(--quant-muted)]'
                        } ${weekend && !isSelected ? 'bg-[var(--quant-surface)]/60' : ''}`}
                      >
                        <span className="flex items-center justify-between">
                          <span
                            className={`grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs font-semibold ${
                              isToday
                                ? 'bg-[var(--brand-primary)] text-white'
                                : 'text-[var(--quant-foreground)]'
                            }`}
                          >
                            {day}
                          </span>
                          {dayEvents.length > 2 && (
                            <span className="text-[10px] font-medium text-[var(--quant-muted-foreground)]">
                              +{dayEvents.length - 2}
                            </span>
                          )}
                        </span>

                        {dayHolidays.map((holiday) => (
                          <HolidayChip key={holiday.name} holiday={holiday} />
                        ))}

                        {dayEvents.slice(0, 2).map((event) => (
                          <span
                            key={event.id}
                            className="hidden items-center gap-1 truncate rounded-md bg-[var(--brand-primary)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--quant-foreground)] md:flex"
                            title={event.title}
                          >
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-primary)]" />
                            <span className="truncate">
                              {event.allDay ? '' : `${hhmm(startOf(event))} `}
                              {event.title}
                            </span>
                          </span>
                        ))}
                        {dayEvents.length > 0 && (
                          <span className="flex gap-0.5 md:hidden" aria-hidden="true">
                            {dayEvents.slice(0, 3).map((event) => (
                              <span
                                key={event.id}
                                className="h-1.5 w-1.5 rounded-full bg-[var(--brand-primary)]"
                              />
                            ))}
                          </span>
                        )}
                      </button>
                    );
                  })}

                  {Array.from({ length: grid.trailing }).map((_, i) => (
                    <div
                      key={`trail-${i}`}
                      className="min-h-[64px] rounded-xl border border-dashed border-[var(--quant-border)]/50 md:min-h-[92px]"
                    />
                  ))}
                </div>
              )}

              {/* Year agenda — every event of {year}: past, today and upcoming */}
              <div className={gridOpen ? 'mt-6' : 'mt-1'}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-[var(--quant-foreground)]">
                    {year} agenda
                  </h2>
                  <button
                    onClick={() => openCreate(selectedDay)}
                    className="rounded-lg border border-[var(--quant-border)] px-2.5 py-1 text-xs font-medium text-[var(--quant-muted-foreground)] transition-colors hover:bg-[var(--quant-muted)]"
                  >
                    Add event
                  </button>
                </div>

                {agenda.length === 0 && (
                  <p className="rounded-xl border border-dashed border-[var(--quant-border)] p-6 text-center text-sm text-[var(--quant-muted-foreground)]">
                    Nothing scheduled this year yet. Double-click any day — or hit Create Event — to
                    add one.
                  </p>
                )}

                {agenda.map((day) => {
                  const isToday = day.key === todayKey;
                  const isPast =
                    day.date.getTime() <
                    new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
                  return (
                    <section
                      key={day.key}
                      data-agenda-key={day.key}
                      className={`mb-3 scroll-mt-2 ${isPast && !isToday ? 'opacity-70' : ''}`}
                      aria-label={day.date.toDateString()}
                    >
                      <header className="mb-1.5 flex items-center gap-2">
                        <span
                          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-bold ${
                            isToday
                              ? 'bg-[var(--brand-primary)] text-white'
                              : 'border border-[var(--quant-border)] text-[var(--quant-foreground)]'
                          }`}
                        >
                          {day.date.getDate()}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold leading-tight">
                            {day.date.toLocaleDateString(undefined, {
                              weekday: 'long',
                              month: 'long',
                              day: 'numeric',
                            })}
                          </p>
                          <p className="text-[11px] uppercase tracking-wide text-[var(--quant-muted-foreground)]">
                            {isToday ? 'Today' : isPast ? 'Past' : 'Upcoming'}
                          </p>
                        </div>
                      </header>

                      {day.holidays.map((holiday) => (
                        <div
                          key={holiday.name}
                          className="mb-2 ml-11 flex items-center gap-3 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-3"
                        >
                          <span className="h-8 w-1 rounded-full bg-[var(--quant-warning,#f0b429)]" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{holiday.name}</p>
                            <p className="text-xs capitalize text-[var(--quant-muted-foreground)]">
                              {holiday.kind === 'national' ? 'Public holiday' : holiday.kind}
                            </p>
                          </div>
                        </div>
                      ))}

                      {day.events.length === 0 && day.holidays.length === 0 && isToday && (
                        <p className="ml-11 rounded-xl border border-dashed border-[var(--quant-border)] p-4 text-sm text-[var(--quant-muted-foreground)]">
                          Nothing scheduled today.
                        </p>
                      )}

                      {day.events.map((event) => (
                        <div
                          key={event.id}
                          className="mb-2 ml-11 flex items-center gap-3 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] p-3 transition-colors hover:bg-[var(--quant-muted)]"
                        >
                          <div className="h-10 w-1 rounded-full bg-[var(--brand-primary)]" />
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-medium text-[var(--quant-foreground)]">
                              {event.title}
                            </h3>
                            <p className="text-xs text-[var(--quant-muted-foreground)]">
                              {event.allDay
                                ? 'All day'
                                : `${hhmm(startOf(event))} – ${hhmm(endOf(event))}`}
                              {event.location ? ` · ${event.location}` : ''}
                            </p>
                          </div>
                          <button
                            className="text-xs text-[var(--quant-destructive)] hover:underline"
                            onClick={() => void deleteEvent.mutateAsync(event.id)}
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                    </section>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* New event — Outlook-style compact compose card */}
        <Modal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title="New event"
          description={selectedDate.toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreateEvent}
                disabled={!newEvent.title || invalidRange || createEvent.isPending}
              >
                {createEvent.isPending ? 'Saving…' : 'Save event'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {/* Big borderless title, like Outlook/Google Calendar */}
            <input
              value={newEvent.title}
              onChange={(e) => setNewEvent((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Add a title"
              aria-label="Event title"
              autoFocus
              className="w-full border-0 border-b border-[var(--quant-border)] bg-transparent px-1 pb-2 text-lg font-semibold outline-none transition-colors placeholder:text-[var(--quant-muted-foreground)]/50 focus:border-[var(--brand-primary)]"
            />

            {/* All-day toggle + quick durations */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleAllDay}
                aria-pressed={newEvent.allDay}
                className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors ${
                  newEvent.allDay
                    ? 'border-[var(--brand-primary)]/60 bg-[var(--brand-primary)]/15 text-[var(--brand-primary)]'
                    : 'border-[var(--quant-border)] text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-muted)]'
                }`}
              >
                All day
              </button>
              {!newEvent.allDay &&
                DURATION_PRESETS.map((preset) => (
                  <button
                    key={preset.minutes}
                    type="button"
                    onClick={() => applyDuration(preset.minutes)}
                    className="inline-flex h-8 items-center rounded-full border border-[var(--quant-border)] px-3 text-xs font-medium text-[var(--quant-muted-foreground)] transition-colors hover:bg-[var(--quant-muted)] hover:text-[var(--quant-foreground)]"
                  >
                    {preset.label}
                  </button>
                ))}
            </div>

            {/* Starts / Ends */}
            {newEvent.allDay ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--quant-muted-foreground)]">
                    Start date
                  </span>
                  <input
                    type="date"
                    className={fieldClasses}
                    value={newEvent.startTime.slice(0, 10)}
                    onChange={(e) =>
                      setNewEvent((prev) => {
                        const v = e.target.value;
                        const endDate = prev.endTime.slice(0, 10);
                        return {
                          ...prev,
                          startTime: `${v}T00:00`,
                          endTime: !endDate || endDate < v ? `${v}T23:59` : prev.endTime,
                        };
                      })
                    }
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--quant-muted-foreground)]">
                    End date
                  </span>
                  <input
                    type="date"
                    className={fieldClasses}
                    value={newEvent.endTime.slice(0, 10)}
                    min={newEvent.startTime.slice(0, 10)}
                    onChange={(e) =>
                      setNewEvent((prev) => ({ ...prev, endTime: `${e.target.value}T23:59` }))
                    }
                  />
                </label>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--quant-muted-foreground)]">
                    Starts
                  </span>
                  <input
                    type="datetime-local"
                    className={fieldClasses}
                    value={newEvent.startTime}
                    onChange={(e) =>
                      setNewEvent((prev) => ({ ...prev, startTime: e.target.value }))
                    }
                  />
                </label>
                <label className="block">
                  <span className="mb-1 flex items-center justify-between text-xs font-medium text-[var(--quant-muted-foreground)]">
                    <span>Ends</span>
                    {durationLabel && (
                      <span className="font-normal text-[var(--quant-muted-foreground)]/80">
                        {durationLabel}
                      </span>
                    )}
                  </span>
                  <input
                    type="datetime-local"
                    className={fieldClasses}
                    value={newEvent.endTime}
                    onChange={(e) => setNewEvent((prev) => ({ ...prev, endTime: e.target.value }))}
                  />
                </label>
              </div>
            )}
            {invalidRange && newEvent.startTime && newEvent.endTime && (
              <p className="text-xs text-[var(--quant-destructive)]">
                End time must be after the start time.
              </p>
            )}

            {/* Location + notes */}
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--quant-muted-foreground)]">
                Location
              </span>
              <input
                className={fieldClasses}
                value={newEvent.location}
                onChange={(e) => setNewEvent((prev) => ({ ...prev, location: e.target.value }))}
                placeholder="Meet link or room"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--quant-muted-foreground)]">
                Notes
              </span>
              <textarea
                rows={2}
                className={`${fieldClasses} resize-none`}
                value={newEvent.description}
                onChange={(e) =>
                  setNewEvent((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Agenda, context, links"
              />
            </label>

            {createEvent.isError && (
              <p className="text-xs text-[var(--quant-destructive)]">
                {(createEvent.error as Error).message}
              </p>
            )}
          </div>
        </Modal>
      </PageTransition>
    </AppShell>
  );
}

function HolidayChip({ holiday }: { holiday: Holiday }) {
  return (
    <span
      className="flex items-center gap-1 truncate rounded-md bg-[var(--quant-warning,#f0b429)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--quant-foreground)]"
      title={holiday.name}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--quant-warning,#f0b429)]" />
      <span className="truncate">{holiday.name}</span>
    </span>
  );
}
