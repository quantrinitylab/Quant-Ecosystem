'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Button, Modal, Skeleton, ErrorState } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
import { useCalendarEvents, useCreateEvent, useDeleteEvent } from '../../hooks/useCalendar';
import { holidaysForMonth, type Holiday, HOLIDAYS } from '../../lib/holidays';
import { showToast } from '../../components/InboxToast';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 7 AM to 9 PM

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

type CalendarView = 'month' | 'week' | 'day' | 'agenda';

export default function CalendarPage() {
  const today = new Date();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number>(today.getDate());
  const [activeView, setActiveView] = useState<CalendarView>('agenda');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [gridOpen, setGridOpen] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventLike | null>(null);
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

  const dayKey = (date: Date) =>
    `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;

  // Full-year agenda with events and Indian holidays
  const agenda = useMemo(() => {
    const map = new Map<
      string,
      { key: string; date: Date; events: CalendarEventLike[]; holidays: Holiday[] }
    >();
    const ensure = (input: Date) => {
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

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      ensure(new Date(year, month, d));
    }

    for (const event of (events ?? []) as unknown as CalendarEventLike[]) {
      const d = startOf(event);
      if (!Number.isNaN(d.getTime())) {
        ensure(d).events.push(event);
      }
    }

    for (const holiday of HOLIDAYS) {
      const parts = holiday.date.split('-');
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      ensure(d).holidays.push(holiday);
    }

    return Array.from(map.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
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
    (day?: number, hour = 10) => {
      const base = new Date(year, month, day ?? selectedDay, hour, 0, 0);
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
      if (activeView === 'agenda') {
        const key = dayKey(new Date(year, month, day));
        const target = scrollHostRef.current?.querySelector(`[data-agenda-key="${key}"]`);
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [year, month, activeView],
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
    try {
      await createEvent.mutateAsync(payload as never);
      setShowCreateModal(false);
      showToast(`Created event "${newEvent.title.trim()}"`, 'success');
    } catch {
      showToast('Failed to create event', 'error');
    }
  }, [newEvent, createEvent]);

  const handleDeleteEvent = useCallback(
    async (id: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (confirm('Delete this event?')) {
        try {
          await deleteEvent.mutateAsync(id);
          setSelectedEvent(null);
          showToast('Event deleted', 'info');
        } catch {
          showToast('Failed to delete event', 'error');
        }
      }
    },
    [deleteEvent],
  );

  const handleAddMeetLink = () => {
    const roomId = `meet-${Math.random().toString(36).substring(2, 8)}`;
    setNewEvent((prev) => ({
      ...prev,
      location: `https://meet.quantrinity.in/${roomId}`,
    }));
    showToast('Generated QuantMeet Video Link', 'info');
  };

  const monthName = MONTH_NAMES[month];

  // Week days calculation for Week View
  const weekDays = useMemo(() => {
    const curr = new Date(year, month, selectedDay);
    const firstDayOfWeek = curr.getDate() - curr.getDay();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(year, month, firstDayOfWeek + i);
      return {
        date: d,
        dayNum: d.getDate(),
        weekday: WEEKDAYS[i],
        isToday:
          d.getDate() === today.getDate() &&
          d.getMonth() === today.getMonth() &&
          d.getFullYear() === today.getFullYear(),
        isSelected: d.getDate() === selectedDay && d.getMonth() === month,
        events: (events ?? []).filter((ev: CalendarEventLike) => {
          const s = startOf(ev);
          return (
            s.getDate() === d.getDate() &&
            s.getMonth() === d.getMonth() &&
            s.getFullYear() === d.getFullYear()
          );
        }),
      };
    });
  }, [year, month, selectedDay, events, today]);

  return (
    <AppShell
      sidebar={<AppSidebar />}
      theme="dark"
      className="quantmail-shell"
      mobileTitle={
        <div className="flex items-center gap-2">
          <h1 className="text-base font-bold text-white">
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
        {/* Desktop Calendar Header Toolbar */}
        <div className="flex flex-wrap items-center justify-between border-b border-[var(--quant-border)] px-4 py-3 sm:px-6 bg-[var(--quant-surface)] gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => goMonth(-1)}
                aria-label="Previous month"
                className="size-8 grid place-items-center rounded-lg border border-[var(--quant-border)] text-zinc-400 hover:text-white hover:bg-[var(--quant-surface-hover)] transition-colors"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => goMonth(1)}
                aria-label="Next month"
                className="size-8 grid place-items-center rounded-lg border border-[var(--quant-border)] text-zinc-400 hover:text-white hover:bg-[var(--quant-surface-hover)] transition-colors"
              >
                ›
              </button>
            </div>

            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-2">
              {monthName} <span className="text-zinc-400 font-normal">{year}</span>
            </h2>

            <button
              type="button"
              onClick={goToday}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-[var(--quant-border)] text-zinc-300 hover:text-white hover:border-[#ff9933]/60 transition-colors"
            >
              Today
            </button>
          </div>

          {/* View Switcher Tabs (Agenda / Week / Day / Month) */}
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-subtle)] p-0.5">
              {(
                [
                  { key: 'agenda', label: 'Agenda' },
                  { key: 'week', label: 'Week' },
                  { key: 'day', label: 'Day' },
                  { key: 'month', label: 'Month' },
                ] as const
              ).map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setActiveView(v.key)}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                    activeView === v.key
                      ? 'bg-[#ff9933] text-[#191008] font-bold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>

            <Button variant="primary" onClick={() => openCreate()}>
              + New Event
            </Button>
          </div>
        </div>

        {/* Collapsible Month Mini-Grid for quick date picking */}
        {gridOpen && (
          <div className="border-b border-[var(--quant-border)] bg-[var(--quant-surface-subtle)] px-4 py-3 sm:px-6">
            <div className="grid grid-cols-7 gap-1 text-center max-w-2xl mx-auto">
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

              {/* Offset days */}
              {Array.from({ length: grid.offset }).map((_, i) => (
                <div
                  key={`prev-${i}`}
                  className="h-8 sm:h-9 flex flex-col items-center justify-center text-xs text-zinc-600 rounded-lg select-none"
                >
                  {grid.prevMonthTotal - grid.offset + i + 1}
                </div>
              ))}

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

                return (
                  <button
                    key={`day-${day}`}
                    type="button"
                    onClick={() => selectDayFromGrid(day)}
                    className={`group relative h-8 sm:h-9 flex flex-col items-center justify-center rounded-xl text-xs font-semibold transition-all ${
                      isSelected
                        ? 'bg-[#ff9933] text-[#191008] shadow-md scale-105 z-10'
                        : isToday
                          ? 'border border-[#ff9933] text-white hover:bg-[var(--quant-surface-hover)]'
                          : 'text-zinc-300 hover:bg-[var(--quant-surface-hover)]'
                    }`}
                  >
                    <span>{day}</span>
                    <div className="flex items-center gap-0.5 mt-0.5">
                      {dayHolidays.length > 0 && (
                        <span
                          className={`size-1 rounded-full ${
                            isSelected ? 'bg-[#191008]' : 'bg-emerald-400'
                          }`}
                        />
                      )}
                      {dayEvents.length > 0 && (
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
          </div>
        )}

        {/* View Router Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="p-6 space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} variant="rect" width="100%" height="80px" />
              ))}
            </div>
          )}

          {error && (
            <div className="p-6">
              <ErrorState message={error.message} onRetry={() => void refetch()} />
            </div>
          )}

          {/* Agenda View */}
          {!isLoading && !error && activeView === 'agenda' && (
            <div ref={scrollHostRef} className="p-4 sm:p-6 space-y-6">
              {/* Seasonal Header Card */}
              <div className="relative overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-gradient-to-br from-[#12171f] via-[#1a141c] to-[#1e130c] p-6 shadow-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[#ff9933]">
                      QuantMail Calendar · Smart Sync
                    </span>
                    <h3 className="text-2xl font-extrabold text-white mt-1">
                      {monthName} {year}
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1">
                      Synced with meetings, reminders, Indian holidays & email threads.
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

              {/* Agenda Days */}
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
                          <span className="text-[10px] uppercase font-semibold tracking-wider text-zinc-400">
                            {isItemToday ? 'Today' : 'Scheduled'}
                          </span>
                        </div>
                      </div>

                      <div className="ml-13 pl-3 border-l border-zinc-800 space-y-2.5">
                        {item.holidays.map((h, hi) => (
                          <div
                            key={hi}
                            className="flex items-center justify-between p-3 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-base">🇮🇳</span>
                              <div>
                                <span className="font-bold text-emerald-300">{h.name}</span>
                                {h.description && (
                                  <p className="text-[11px] text-zinc-400">{h.description}</p>
                                )}
                              </div>
                            </div>
                            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                              Holiday
                            </span>
                          </div>
                        ))}

                        {item.events.map((ev) => (
                          <div
                            key={ev.id}
                            onClick={() => setSelectedEvent(ev)}
                            className="group flex items-center justify-between p-3.5 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] hover:border-[#ff9933]/60 transition-all cursor-pointer shadow-sm"
                          >
                            <div className="flex items-start gap-3">
                              <span className="text-base mt-0.5">📅</span>
                              <div>
                                <h5 className="text-xs font-bold text-white group-hover:text-[#ff9933] transition-colors">
                                  {ev.title}
                                </h5>
                                <p className="text-[11px] text-zinc-400 mt-0.5">
                                  {ev.allDay
                                    ? 'All Day'
                                    : `${hhmm(startOf(ev))} - ${hhmm(endOf(ev))}`}
                                  {ev.location ? ` · 📍 ${ev.location}` : ''}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {ev.location?.includes('meet.quantrinity.in') && (
                                <a
                                  href={ev.location}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="px-2.5 py-1 rounded-lg bg-[#ff9933]/20 text-[#ff9933] text-xs font-bold hover:bg-[#ff9933]/30 transition-colors"
                                >
                                  🎥 Join Video
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={(e) => handleDeleteEvent(ev.id, e)}
                                className="p-1 text-zinc-500 hover:text-rose-400 text-xs"
                                title="Delete"
                              >
                                🗑
                              </button>
                            </div>
                          </div>
                        ))}

                        {!hasContent && (
                          <div
                            onClick={() => openCreate(dayNum)}
                            className="p-3 rounded-xl border border-dashed border-zinc-800 text-zinc-500 text-xs hover:border-[#ff9933]/40 hover:text-zinc-300 transition-colors cursor-pointer"
                          >
                            + Click to schedule on this day
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Week View */}
          {!isLoading && !error && activeView === 'week' && (
            <div className="p-4 sm:p-6">
              <div className="grid grid-cols-7 gap-3 min-w-[700px]">
                {weekDays.map((col) => (
                  <div
                    key={col.date.toISOString()}
                    className={`flex flex-col rounded-2xl border p-3 min-h-[450px] ${
                      col.isSelected
                        ? 'border-[#ff9933] bg-[#ff9933]/5'
                        : col.isToday
                          ? 'border-zinc-700 bg-zinc-900/60'
                          : 'border-[var(--quant-border)] bg-[var(--quant-surface)]'
                    }`}
                  >
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-3">
                      <span className="text-xs font-bold uppercase text-zinc-400">
                        {col.weekday}
                      </span>
                      <span
                        className={`size-6 rounded-full text-xs font-bold flex items-center justify-center ${
                          col.isToday ? 'bg-[#ff9933] text-[#191008]' : 'text-white'
                        }`}
                      >
                        {col.dayNum}
                      </span>
                    </div>

                    <div className="flex-1 space-y-2">
                      {col.events.map((ev) => (
                        <div
                          key={ev.id}
                          onClick={() => setSelectedEvent(ev)}
                          className="p-2 rounded-lg bg-[#ff9933]/15 border border-[#ff9933]/40 hover:border-[#ff9933] cursor-pointer text-xs transition-colors"
                        >
                          <strong className="block text-white truncate">{ev.title}</strong>
                          <span className="text-[10px] text-zinc-400">
                            {hhmm(startOf(ev))} - {hhmm(endOf(ev))}
                          </span>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() => openCreate(col.dayNum)}
                        className="w-full py-1.5 rounded border border-dashed border-zinc-800 text-zinc-500 hover:text-zinc-300 text-[11px] transition-colors"
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Day View */}
          {!isLoading && !error && activeView === 'day' && (
            <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-2">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                <h3 className="text-base font-bold text-white">
                  Schedule for {FULL_WEEKDAYS[new Date(year, month, selectedDay).getDay()]},{' '}
                  {monthName} {selectedDay}
                </h3>
                <Button variant="primary" onClick={() => openCreate(selectedDay)}>
                  + Schedule Event
                </Button>
              </div>

              <div className="divide-y divide-zinc-800/80">
                {HOURS.map((hour) => {
                  const hourLabel = `${hour > 12 ? hour - 12 : hour}:00 ${
                    hour >= 12 ? 'PM' : 'AM'
                  }`;
                  const slotEvents = (eventsByDay[selectedDay] ?? []).filter((ev) => {
                    const d = startOf(ev);
                    return d.getHours() === hour;
                  });

                  return (
                    <div
                      key={hour}
                      onClick={() => openCreate(selectedDay, hour)}
                      className="group flex items-start gap-4 py-3 px-2 hover:bg-zinc-800/30 rounded-xl transition-colors cursor-pointer"
                    >
                      <span className="w-18 text-xs font-mono text-zinc-500 shrink-0">
                        {hourLabel}
                      </span>
                      <div className="flex-1 space-y-2">
                        {slotEvents.map((ev) => (
                          <div
                            key={ev.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEvent(ev);
                            }}
                            className="p-3 rounded-xl bg-gradient-to-r from-[#ff9933]/20 to-amber-500/10 border border-[#ff9933]/50 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <strong className="text-sm font-bold text-white">{ev.title}</strong>
                              <span className="text-[11px] font-mono text-zinc-400">
                                {hhmm(startOf(ev))} - {hhmm(endOf(ev))}
                              </span>
                            </div>
                            {ev.location && (
                              <p className="text-[11px] text-zinc-300 mt-1">📍 {ev.location}</p>
                            )}
                          </div>
                        ))}
                        {slotEvents.length === 0 && (
                          <span className="text-xs text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity">
                            + Click to block this hour
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Month Grid View */}
          {!isLoading && !error && activeView === 'month' && (
            <div className="p-4 sm:p-6">
              <div className="grid grid-cols-7 gap-2">
                {WEEKDAYS.map((d, i) => (
                  <div
                    key={i}
                    className="text-center font-bold text-xs uppercase text-zinc-400 py-2"
                  >
                    {d}
                  </div>
                ))}
                {Array.from({ length: grid.offset }).map((_, i) => (
                  <div
                    key={`mprev-${i}`}
                    className="min-h-[100px] p-2 rounded-xl bg-zinc-900/20 border border-zinc-900 text-zinc-600 text-xs"
                  >
                    {grid.prevMonthTotal - grid.offset + i + 1}
                  </div>
                ))}
                {Array.from({ length: grid.total }).map((_, i) => {
                  const day = i + 1;
                  const dayEvents = eventsByDay[day] ?? [];
                  const isToday =
                    today.getDate() === day &&
                    today.getMonth() === month &&
                    today.getFullYear() === year;

                  return (
                    <div
                      key={`mday-${day}`}
                      onClick={() => openCreate(day)}
                      className={`min-h-[100px] p-2 rounded-xl border flex flex-col justify-between cursor-pointer transition-colors ${
                        isToday
                          ? 'border-[#ff9933] bg-[#ff9933]/5'
                          : 'border-[var(--quant-border)] bg-[var(--quant-surface)] hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`size-6 rounded-full text-xs font-bold flex items-center justify-center ${
                            isToday ? 'bg-[#ff9933] text-[#191008]' : 'text-white'
                          }`}
                        >
                          {day}
                        </span>
                      </div>
                      <div className="space-y-1 mt-1 flex-1">
                        {dayEvents.slice(0, 2).map((ev) => (
                          <div
                            key={ev.id}
                            className="truncate px-1.5 py-0.5 rounded bg-[#ff9933]/20 text-[#ff9933] text-[10px] font-semibold"
                          >
                            {ev.title}
                          </div>
                        ))}
                        {dayEvents.length > 2 && (
                          <span className="text-[10px] text-zinc-500">
                            +{dayEvents.length - 2} more
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Event Detail Modal */}
        <Modal
          isOpen={!!selectedEvent}
          onClose={() => setSelectedEvent(null)}
          title={selectedEvent?.title || 'Event Details'}
        >
          <div className="p-4 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <span>🕒</span>
                <span>
                  {selectedEvent?.allDay
                    ? 'All Day'
                    : selectedEvent
                      ? `${hhmm(startOf(selectedEvent))} - ${hhmm(endOf(selectedEvent))}`
                      : ''}
                </span>
              </div>
              {selectedEvent?.location && (
                <div className="flex items-center gap-2 text-xs text-zinc-300">
                  <span>📍</span>
                  <span>{selectedEvent.location}</span>
                </div>
              )}
              {selectedEvent?.description && (
                <p className="text-xs text-zinc-300 pt-2 border-t border-zinc-800">
                  {selectedEvent.description}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              {selectedEvent?.location?.includes('meet.quantrinity.in') ? (
                <a
                  href={selectedEvent.location}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-[#ff9933] text-[#191008] text-xs font-bold hover:bg-amber-400 transition-colors"
                >
                  🎥 Join QuantMeet
                </a>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-2">
                <Button
                  variant="danger"
                  onClick={() => selectedEvent && handleDeleteEvent(selectedEvent.id)}
                >
                  Delete Event
                </Button>
                <Button variant="secondary" onClick={() => setSelectedEvent(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </Modal>

        {/* Create Event Modal */}
        <Modal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title="Schedule New Event"
        >
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Event Title</label>
              <input
                type="text"
                value={newEvent.title}
                onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                placeholder="e.g. Product Demo, Sprint Planning, 1-on-1…"
                className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff9933]"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Starts</label>
                <input
                  type="datetime-local"
                  value={newEvent.startTime}
                  onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
                  className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#ff9933]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">Ends</label>
                <input
                  type="datetime-local"
                  value={newEvent.endTime}
                  onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
                  className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#ff9933]"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-zinc-300">
                  Location / Video Link
                </label>
                <button
                  type="button"
                  onClick={handleAddMeetLink}
                  className="text-[11px] text-[#ff9933] hover:underline font-semibold"
                >
                  + Add QuantMeet Video
                </button>
              </div>
              <input
                type="text"
                value={newEvent.location}
                onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                placeholder="e.g. Conference Room A or meet URL"
                className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff9933]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">Description</label>
              <textarea
                value={newEvent.description}
                onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                placeholder="Agenda, notes, meeting context…"
                rows={3}
                className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#ff9933]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleCreateEvent}>
                Save Event
              </Button>
            </div>
          </div>
        </Modal>
      </PageTransition>
    </AppShell>
  );
}
