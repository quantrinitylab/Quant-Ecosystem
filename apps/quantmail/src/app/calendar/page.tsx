'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Button, Modal, Skeleton, ErrorState } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
import { useCalendarEvents, useCreateEvent, useDeleteEvent } from '../../hooks/useCalendar';
import { holidaysForMonth, type Holiday, HOLIDAYS } from '../../lib/holidays';
import { showToast } from '../../components/InboxToast';

const WEEKDAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
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

export interface CalendarEventLike {
  id: string;
  title: string;
  startTime?: string | Date;
  endTime?: string | Date;
  start?: string | Date;
  end?: string | Date;
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

type CalendarView = 'agenda' | 'week' | 'day' | 'month';

export default function CalendarPage() {
  const today = useMemo(() => new Date(), []);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [activeView, setActiveView] = useState<CalendarView>('agenda');
  const [isMonthExpanded, setIsMonthExpanded] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventLike | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Infinite agenda buffer: days from anchor date (-15 days to +45 days)
  const [agendaRangeDays, setAgendaRangeDays] = useState({ past: 10, future: 35 });

  const [newEvent, setNewEvent] = useState({
    title: '',
    startTime: '',
    endTime: '',
    location: '',
    description: '',
    allDay: false,
  });

  const scrollHostRef = useRef<HTMLDivElement>(null);
  const dateItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const start = new Date(year, month - 1, 1).toISOString();
  const end = new Date(year, month + 2, 0, 23, 59, 59).toISOString();

  const { data: rawEvents, isLoading, error, refetch } = useCalendarEvents({ start, end });
  const events = (rawEvents ?? []) as unknown as CalendarEventLike[];
  const createEvent = useCreateEvent();
  const deleteEvent = useDeleteEvent();

  const dayKey = (date: Date) =>
    `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;

  // Month grid metrics
  const grid = useMemo(() => {
    const total = new Date(year, month + 1, 0).getDate();
    const offset = new Date(year, month, 1).getDay();
    const prevMonthTotal = new Date(year, month, 0).getDate();
    return { total, offset, prevMonthTotal, trailing: (7 - ((offset + total) % 7)) % 7 };
  }, [year, month]);

  const holidays = useMemo(() => holidaysForMonth(year, month), [year, month]);

  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEventLike[]> = {};
    for (const event of events) {
      const d = startOf(event);
      if (Number.isNaN(d.getTime())) continue;
      const key = dayKey(d);
      map[key] = [...(map[key] ?? []), event];
    }
    return map;
  }, [events]);

  // Month grid weeks data structure for continuous Outlook-style vertical drawer
  const monthWeeks = useMemo(() => {
    const allDays: Array<{
      date: Date;
      dayNum: number;
      isCurrentMonth: boolean;
      isSelected: boolean;
      isToday: boolean;
      key: string;
      hasHolidays: boolean;
      hasEvents: boolean;
    }> = [];

    // Prev month days
    for (let i = grid.offset - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, grid.prevMonthTotal - i);
      const k = dayKey(d);
      allDays.push({
        date: d,
        dayNum: d.getDate(),
        isCurrentMonth: false,
        isSelected: k === dayKey(selectedDate),
        isToday: k === dayKey(today),
        key: k,
        hasHolidays: (holidays[d.getDate()] ?? []).length > 0,
        hasEvents: (eventsByDay[k] ?? []).length > 0,
      });
    }

    // Current month days
    for (let d = 1; d <= grid.total; d++) {
      const date = new Date(year, month, d);
      const k = dayKey(date);
      allDays.push({
        date,
        dayNum: d,
        isCurrentMonth: true,
        isSelected: k === dayKey(selectedDate),
        isToday: k === dayKey(today),
        key: k,
        hasHolidays: (holidays[d] ?? []).length > 0,
        hasEvents: (eventsByDay[k] ?? []).length > 0,
      });
    }

    // Trailing days
    for (let d = 1; d <= grid.trailing; d++) {
      const date = new Date(year, month + 1, d);
      const k = dayKey(date);
      allDays.push({
        date,
        dayNum: d,
        isCurrentMonth: false,
        isSelected: k === dayKey(selectedDate),
        isToday: k === dayKey(today),
        key: k,
        hasHolidays: false,
        hasEvents: (eventsByDay[k] ?? []).length > 0,
      });
    }

    const weeks: (typeof allDays)[] = [];
    for (let i = 0; i < allDays.length; i += 7) {
      weeks.push(allDays.slice(i, i + 7));
    }
    return weeks;
  }, [grid, year, month, selectedDate, today, holidays, eventsByDay]);

  const selectedWeekIndex = useMemo(() => {
    const idx = monthWeeks.findIndex((week) => week.some((d) => d.key === dayKey(selectedDate)));
    return idx >= 0 ? idx : 0;
  }, [monthWeeks, selectedDate]);

  const scrollToDate = useCallback((date: Date) => {
    const key = dayKey(date);
    const target = dateItemRefs.current.get(key);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const selectDate = useCallback(
    (date: Date) => {
      setSelectedDate(date);
      if (
        date.getMonth() !== currentDate.getMonth() ||
        date.getFullYear() !== currentDate.getFullYear()
      ) {
        setCurrentDate(new Date(date.getFullYear(), date.getMonth(), 1));
      }
      scrollToDate(date);
    },
    [currentDate, scrollToDate],
  );

  const goMonth = useCallback((delta: number) => {
    setCurrentDate((curr) => new Date(curr.getFullYear(), curr.getMonth() + delta, 1));
  }, []);

  const goToday = useCallback(() => {
    const now = new Date();
    setSelectedDate(now);
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
    scrollToDate(now);
  }, [scrollToDate]);

  // Dimension Constants for direct 1:1 finger tracking
  const numWeeks = monthWeeks.length || 5;
  const ROW_HEIGHT = 40;
  const HEADER_HEIGHT = 28;
  const MONTH_NAV_HEIGHT = 32;
  const HANDLE_HEIGHT = 22;

  const COLLAPSED_HEIGHT = HEADER_HEIGHT + ROW_HEIGHT + HANDLE_HEIGHT; // ~90px
  const EXPANDED_HEIGHT = MONTH_NAV_HEIGHT + HEADER_HEIGHT + numWeeks * ROW_HEIGHT + HANDLE_HEIGHT; // ~282px

  // Interactive real-time drag state
  const [isDragging, setIsDragging] = useState(false);
  const [currentHeight, setCurrentHeight] = useState(COLLAPSED_HEIGHT);
  const pointerStartRef = useRef<{
    startY: number;
    startHeight: number;
    startX: number;
    time: number;
  } | null>(null);

  // Synchronize height when isMonthExpanded changes from external or programmatic action
  useEffect(() => {
    if (!isDragging) {
      setCurrentHeight(isMonthExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT);
    }
  }, [isMonthExpanded, EXPANDED_HEIGHT, COLLAPSED_HEIGHT, isDragging]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const initialH = isMonthExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
      pointerStartRef.current = {
        startY: e.clientY,
        startHeight: initialH,
        startX: e.clientX,
        time: Date.now(),
      };
      setIsDragging(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    },
    [isMonthExpanded, EXPANDED_HEIGHT, COLLAPSED_HEIGHT],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!pointerStartRef.current) return;
      const deltaY = e.clientY - pointerStartRef.current.startY;
      const targetH = pointerStartRef.current.startHeight + deltaY;
      const clamped = Math.max(COLLAPSED_HEIGHT, Math.min(EXPANDED_HEIGHT, targetH));
      setCurrentHeight(clamped);
    },
    [COLLAPSED_HEIGHT, EXPANDED_HEIGHT],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!pointerStartRef.current) return;
      const deltaY = e.clientY - pointerStartRef.current.startY;
      const deltaX = e.clientX - pointerStartRef.current.startX;
      const duration = Date.now() - pointerStartRef.current.time;
      const velocityY = deltaY / (duration || 1);

      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }

      pointerStartRef.current = null;
      setIsDragging(false);

      // Quick tap detection: toggle between collapsed and expanded
      if (Math.abs(deltaY) < 6 && Math.abs(deltaX) < 6 && duration < 300) {
        setIsMonthExpanded((prev) => !prev);
        return;
      }

      // Horizontal swipe to change month
      if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY) && isMonthExpanded) {
        if (deltaX < 0) goMonth(1);
        else goMonth(-1);
        return;
      }

      // Continuous drag snapping based on threshold or velocity
      const midpoint = (COLLAPSED_HEIGHT + EXPANDED_HEIGHT) / 2;
      if (velocityY > 0.25 || currentHeight > midpoint + 15) {
        setIsMonthExpanded(true);
        setCurrentHeight(EXPANDED_HEIGHT);
      } else if (velocityY < -0.25 || currentHeight < midpoint - 15) {
        setIsMonthExpanded(false);
        setCurrentHeight(COLLAPSED_HEIGHT);
      } else {
        if (currentHeight >= midpoint) {
          setIsMonthExpanded(true);
          setCurrentHeight(EXPANDED_HEIGHT);
        } else {
          setIsMonthExpanded(false);
          setCurrentHeight(COLLAPSED_HEIGHT);
        }
      }
    },
    [COLLAPSED_HEIGHT, EXPANDED_HEIGHT, currentHeight, isMonthExpanded, goMonth],
  );

  const expansionProgress = useMemo(() => {
    if (EXPANDED_HEIGHT === COLLAPSED_HEIGHT) return 0;
    return Math.max(
      0,
      Math.min(1, (currentHeight - COLLAPSED_HEIGHT) / (EXPANDED_HEIGHT - COLLAPSED_HEIGHT)),
    );
  }, [currentHeight, COLLAPSED_HEIGHT, EXPANDED_HEIGHT]);

  // Infinite / Continuous Agenda Days
  const continuousAgendaDays = useMemo(() => {
    const list: Array<{
      date: Date;
      key: string;
      dayNum: number;
      weekdayName: string;
      isToday: boolean;
      isTomorrow: boolean;
      events: CalendarEventLike[];
      holidays: Holiday[];
    }> = [];

    const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const tomorrow = new Date(base);
    tomorrow.setDate(base.getDate() + 1);

    const startIdx = -agendaRangeDays.past;
    const endIdx = agendaRangeDays.future;

    for (let i = startIdx; i <= endIdx; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const key = dayKey(d);
      const isDayToday = key === dayKey(today);
      const isDayTomorrow = key === dayKey(tomorrow);

      // Find events for this date
      const dayEvents = eventsByDay[key] ?? [];

      // Find holidays
      const dayHolidays = HOLIDAYS.filter((h) => {
        const parts = h.date.split('-');
        if (parts.length === 3) {
          const hd = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
          return dayKey(hd) === key;
        }
        return false;
      });

      if (
        !searchFilter.trim() ||
        dayEvents.some((e) => e.title.toLowerCase().includes(searchFilter.toLowerCase())) ||
        dayHolidays.some((h) => h.name.toLowerCase().includes(searchFilter.toLowerCase()))
      ) {
        list.push({
          date: d,
          key,
          dayNum: d.getDate(),
          weekdayName: FULL_WEEKDAYS[d.getDay()],
          isToday: isDayToday,
          isTomorrow: isDayTomorrow,
          events: dayEvents,
          holidays: dayHolidays,
        });
      }
    }

    return list;
  }, [today, agendaRangeDays, eventsByDay, searchFilter]);

  const openCreate = useCallback(
    (date?: Date, hour = 10) => {
      const base = date ? new Date(date) : new Date(selectedDate);
      base.setHours(hour, 0, 0, 0);
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
    [selectedDate],
  );

  useEffect(() => {
    const handler = () => openCreate();
    window.addEventListener('quant:calendar:create', handler);
    return () => window.removeEventListener('quant:calendar:create', handler);
  }, [openCreate]);

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
      showToast({ text: `Event "${newEvent.title.trim()}" scheduled`, type: 'success' });
      await refetch();
    } catch {
      showToast({ text: 'Failed to schedule event', type: 'error' });
    }
  }, [newEvent, createEvent, refetch]);

  const handleDeleteEvent = useCallback(
    async (id: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (confirm('Delete this event?')) {
        try {
          await deleteEvent.mutateAsync(id);
          setSelectedEvent(null);
          showToast({ text: 'Event deleted', type: 'info' });
          await refetch();
        } catch {
          showToast({ text: 'Failed to delete event', type: 'error' });
        }
      }
    },
    [deleteEvent, refetch],
  );

  const handleAddMeetLink = () => {
    const roomId = `meet-${Math.random().toString(36).substring(2, 8)}`;
    setNewEvent((prev) => ({
      ...prev,
      location: `https://meet.quantrinity.in/${roomId}`,
    }));
    showToast({ text: 'Generated QuantMeet Video Link', type: 'info' });
  };

  const monthName = MONTH_NAMES[month];

  // Infinite scroll listener for agenda
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 200) {
      setAgendaRangeDays((prev) => ({ ...prev, future: prev.future + 25 }));
    }
    if (scrollTop < 100) {
      setAgendaRangeDays((prev) => ({ ...prev, past: prev.past + 15 }));
    }
  };

  return (
    <AppShell
      sidebar={<AppSidebar />}
      theme="dark"
      className="quantmail-shell"
      mobileTitle={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsMonthExpanded((prev) => !prev)}
            className="flex items-center gap-1 text-base font-bold text-white hover:text-[#3b82f6] transition-colors"
          >
            <span>{monthName}</span>
            <svg
              className={`size-4 transition-transform duration-200 ${isMonthExpanded ? 'rotate-180' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </div>
      }
      mobileActions={
        <div className="flex items-center gap-1.5">
          {/* View mode toggle */}
          <button
            type="button"
            onClick={() =>
              setActiveView((v) => (v === 'agenda' ? 'month' : v === 'month' ? 'week' : 'agenda'))
            }
            className="size-8 inline-flex items-center justify-center rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
            aria-label="Toggle calendar view"
          >
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M3 10h18M8 2v4M16 2v4" />
            </svg>
          </button>

          {/* Search Toggle */}
          <button
            type="button"
            onClick={() => setIsSearchOpen((prev) => !prev)}
            className="size-8 inline-flex items-center justify-center rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
            aria-label="Search calendar"
          >
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </button>

          {/* Today Jump Chip */}
          <button
            type="button"
            onClick={goToday}
            className="px-2 py-1 text-xs font-semibold rounded-md border border-zinc-700 bg-zinc-900 text-[#3b82f6] hover:bg-zinc-800 transition-colors"
          >
            Today
          </button>
        </div>
      }
    >
      <PageTransition className="flex flex-col h-full bg-black text-white relative">
        {/* Search Bar on Mobile when toggled */}
        {isSearchOpen && (
          <div className="border-b border-zinc-800 bg-zinc-950 px-4 py-2">
            <input
              type="search"
              placeholder="Search events, meetings, holidays…"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#3b82f6]"
              autoFocus
            />
          </div>
        )}

        {/* Desktop Header Toolbar (Hidden on Mobile) */}
        <div className="hidden md:flex items-center justify-between border-b border-zinc-800 px-6 py-3 bg-zinc-950">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => goMonth(-1)}
                className="size-8 grid place-items-center rounded-lg border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => goMonth(1)}
                className="size-8 grid place-items-center rounded-lg border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                ›
              </button>
            </div>

            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              {monthName} <span className="text-zinc-400 font-normal">{year}</span>
            </h2>

            <button
              type="button"
              onClick={goToday}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-zinc-700 text-zinc-300 hover:text-white hover:border-[#ff9933] transition-colors"
            >
              Today
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
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
                  className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
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

        {/* Outlook-Style Interactive Expandable Date Picker with 1:1 Direct Finger Physics */}
        <div
          className="border-b border-zinc-800 bg-[#161618] select-none overflow-hidden relative"
          style={{
            height: `${currentHeight}px`,
            transition: isDragging ? 'none' : 'height 0.24s cubic-bezier(0.16, 1, 0.3, 1)',
            touchAction: 'none',
          }}
        >
          <div className="flex flex-col h-full justify-between px-3 pt-2 pb-0.5">
            {/* Top Month Header Navigation (fades in as expansionProgress increases) */}
            <div
              className="flex items-center justify-between px-2 overflow-hidden"
              style={{
                height: `${MONTH_NAV_HEIGHT * expansionProgress}px`,
                opacity: expansionProgress,
                transform: `translateY(${(1 - expansionProgress) * -10}px)`,
                pointerEvents: expansionProgress > 0.4 ? 'auto' : 'none',
                transition: isDragging ? 'none' : 'opacity 0.2s, height 0.2s',
              }}
            >
              <span className="text-xs font-bold text-zinc-300">
                {monthName} {year}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => goMonth(-1)}
                  className="size-6 text-xs text-zinc-400 hover:text-white rounded hover:bg-zinc-800 flex items-center justify-center"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => goMonth(1)}
                  className="size-6 text-xs text-zinc-400 hover:text-white rounded hover:bg-zinc-800 flex items-center justify-center"
                >
                  ›
                </button>
              </div>
            </div>

            {/* Weekday Label Headers (S M T W T F S) — always fixed at top */}
            <div className="grid grid-cols-7 text-center py-0.5">
              {WEEKDAYS_SHORT.map((d, i) => (
                <div key={i} className="text-[11px] font-semibold text-zinc-400">
                  {d}
                </div>
              ))}
            </div>

            {/* Month Weeks Container with 1:1 translation */}
            <div className="overflow-hidden flex-1 relative">
              <div
                className="space-y-0"
                style={{
                  transform: `translateY(-${(1 - expansionProgress) * selectedWeekIndex * ROW_HEIGHT}px)`,
                  transition: isDragging ? 'none' : 'transform 0.24s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                {monthWeeks.map((week, weekIdx) => {
                  const isSelectedWeek = weekIdx === selectedWeekIndex;
                  const rowOpacity = isSelectedWeek
                    ? 1
                    : Math.max(0, (expansionProgress - 0.15) / 0.85);

                  return (
                    <div
                      key={`week-${weekIdx}`}
                      className="grid grid-cols-7 text-center h-[40px] items-center"
                      style={{
                        opacity: isDragging
                          ? rowOpacity
                          : isMonthExpanded
                            ? 1
                            : isSelectedWeek
                              ? 1
                              : 0,
                        transition: isDragging ? 'none' : 'opacity 0.2s',
                      }}
                    >
                      {week.map((d) => (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() => selectDate(d.date)}
                          className="flex items-center justify-center py-0.5 focus:outline-none"
                        >
                          <span
                            className={`size-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                              d.isSelected
                                ? 'bg-[#3b82f6] text-white font-bold shadow-md scale-105'
                                : d.isToday
                                  ? 'border border-[#3b82f6] text-[#3b82f6]'
                                  : d.isCurrentMonth
                                    ? 'text-zinc-200 hover:bg-zinc-800'
                                    : 'text-zinc-600'
                            }`}
                          >
                            {d.dayNum}
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Real-time Interactive Drag Handle at the Bottom */}
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="w-full flex flex-col items-center justify-center py-2 cursor-grab active:cursor-grabbing group select-none touch-none"
              style={{ touchAction: 'none' }}
              title="Drag up or down to expand/collapse calendar"
            >
              <div
                className={`w-12 h-1.5 rounded-full transition-all ${
                  isDragging ? 'bg-[#3b82f6] scale-110' : 'bg-zinc-700 group-hover:bg-zinc-500'
                }`}
              />
            </div>
          </div>
        </div>

        {/* View Content: Infinite Continuous Agenda Feed */}
        <div
          ref={scrollHostRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-4 py-3 sm:px-6 space-y-6 pb-28 md:pb-6"
        >
          {isLoading && (
            <div className="space-y-4 py-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} variant="rect" width="100%" height="72px" />
              ))}
            </div>
          )}

          {error && (
            <div className="py-8">
              <ErrorState message={error.message} onRetry={() => void refetch()} />
            </div>
          )}

          {!isLoading && !error && (
            <div className="space-y-5">
              {continuousAgendaDays.map((item) => {
                const isSelected = dayKey(item.date) === dayKey(selectedDate);
                const hasEvents = item.events.length > 0;
                const hasHolidays = item.holidays.length > 0;

                return (
                  <div
                    key={item.key}
                    ref={(el) => {
                      if (el) dateItemRefs.current.set(item.key, el);
                      else dateItemRefs.current.delete(item.key);
                    }}
                    className={`transition-all duration-200 ${
                      isSelected ? 'bg-zinc-900/40 rounded-2xl p-2' : ''
                    }`}
                  >
                    {/* Day Heading matching Outlook format: 13 Thursday Today / 14 Friday Tomorrow */}
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <span
                        className={`text-base font-extrabold ${
                          item.isToday
                            ? 'text-[#3b82f6]'
                            : isSelected
                              ? 'text-white'
                              : 'text-zinc-100'
                        }`}
                      >
                        {item.dayNum} {item.weekdayName}
                      </span>

                      {item.isToday && (
                        <span className="text-xs font-bold text-[#3b82f6]">Today</span>
                      )}
                      {item.isTomorrow && (
                        <span className="text-xs font-semibold text-zinc-400">Tomorrow</span>
                      )}
                    </div>

                    {/* Content under Day: Events, Indian Holidays, or "No plans yet" */}
                    <div className="space-y-2">
                      {/* Holidays */}
                      {item.holidays.map((h, hi) => (
                        <div
                          key={hi}
                          className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-950/25 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span>🇮🇳</span>
                            <div>
                              <span className="font-bold text-emerald-300">{h.name}</span>
                              {h.description && (
                                <p className="text-[10px] text-zinc-400">{h.description}</p>
                              )}
                            </div>
                          </div>
                          <span className="text-[9px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                            Holiday
                          </span>
                        </div>
                      ))}

                      {/* Scheduled Events */}
                      {item.events.map((ev) => (
                        <div
                          key={ev.id}
                          onClick={() => setSelectedEvent(ev)}
                          className="flex items-center justify-between p-3 rounded-xl border border-zinc-800 bg-zinc-900 hover:border-[#3b82f6]/50 transition-colors cursor-pointer shadow-sm"
                        >
                          <div className="flex items-start gap-2.5">
                            <span className="size-2 rounded-full bg-[#3b82f6] mt-1.5 shrink-0" />
                            <div>
                              <h5 className="text-xs font-bold text-white">{ev.title}</h5>
                              <p className="text-[11px] text-zinc-400 mt-0.5">
                                {ev.allDay
                                  ? 'All Day'
                                  : `${hhmm(startOf(ev))} – ${hhmm(endOf(ev))}`}
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
                                className="px-2.5 py-1 rounded-lg bg-[#3b82f6]/20 text-[#3b82f6] text-[11px] font-bold hover:bg-[#3b82f6]/30 transition-colors"
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

                      {/* Empty State */}
                      {!hasEvents && !hasHolidays && (
                        <div
                          onClick={() => openCreate(item.date)}
                          className="text-xs text-zinc-500 font-normal hover:text-zinc-300 transition-colors cursor-pointer py-0.5"
                        >
                          No plans yet
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Dedicated Calendar Floating Action Button (+) matching Outlook style — only on mobile */}
        <button
          type="button"
          onClick={() => openCreate()}
          className="fixed bottom-20 right-4 md:hidden z-40 size-14 rounded-full bg-[#3b82f6] hover:bg-[#2563eb] text-white font-bold shadow-2xl flex items-center justify-center active:scale-95 transition-all focus:outline-none focus:ring-4 focus:ring-[#3b82f6]/40"
          aria-label="New calendar event"
        >
          <svg
            className="size-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>

        {/* Create Event Modal */}
        <Modal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          title="Schedule Event"
        >
          <div className="space-y-4 text-xs text-white">
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                Event Title *
              </label>
              <input
                type="text"
                value={newEvent.title}
                onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                placeholder="e.g. Product Review with Team"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-[#3b82f6]"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  Start Time
                </label>
                <input
                  type="datetime-local"
                  value={newEvent.startTime}
                  onChange={(e) => setNewEvent({ ...newEvent, startTime: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-[#3b82f6]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                  End Time
                </label>
                <input
                  type="datetime-local"
                  value={newEvent.endTime}
                  onChange={(e) => setNewEvent({ ...newEvent, endTime: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-[#3b82f6]"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-zinc-400">
                  Location / Video Link
                </label>
                <button
                  type="button"
                  onClick={handleAddMeetLink}
                  className="text-[11px] text-[#3b82f6] hover:underline font-semibold"
                >
                  + Add QuantMeet Link
                </button>
              </div>
              <input
                type="text"
                value={newEvent.location}
                onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                placeholder="Room 101 or https://meet.quantrinity.in/…"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-[#3b82f6]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Notes</label>
              <textarea
                value={newEvent.description}
                onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                rows={3}
                placeholder="Agenda, attendees, topics to discuss…"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-[#3b82f6]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <Button variant="ghost" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void handleCreateEvent()}>
                Save Event
              </Button>
            </div>
          </div>
        </Modal>

        {/* Event Detail Inspector Modal */}
        {selectedEvent && (
          <Modal
            isOpen={Boolean(selectedEvent)}
            onClose={() => setSelectedEvent(null)}
            title={selectedEvent.title}
          >
            <div className="space-y-3 text-xs text-zinc-300">
              <div className="flex items-center gap-2 text-white font-semibold">
                <span>🕒</span>
                <span>
                  {selectedEvent.allDay
                    ? 'All Day Event'
                    : `${startOf(selectedEvent).toLocaleString()} – ${endOf(selectedEvent).toLocaleTimeString()}`}
                </span>
              </div>

              {selectedEvent.location && (
                <div className="flex items-center gap-2">
                  <span>📍</span>
                  {selectedEvent.location.includes('meet.quantrinity.in') ? (
                    <a
                      href={selectedEvent.location}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#3b82f6] hover:underline font-bold"
                    >
                      {selectedEvent.location} (🎥 Join Meeting)
                    </a>
                  ) : (
                    <span>{selectedEvent.location}</span>
                  )}
                </div>
              )}

              {selectedEvent.description && (
                <div className="pt-2 border-t border-zinc-800 text-zinc-400">
                  {selectedEvent.description}
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => handleDeleteEvent(selectedEvent.id)}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 text-xs font-semibold"
                >
                  Delete Event
                </button>
                <Button variant="ghost" onClick={() => setSelectedEvent(null)}>
                  Close
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </PageTransition>
    </AppShell>
  );
}
