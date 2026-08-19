'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button, Modal, Skeleton, ErrorState } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import { PageTransition } from '../../components/PageTransition';
import { useCalendarEvents, useCreateEvent, useDeleteEvent } from '../../hooks/useCalendar';
import { useAuth } from '../../providers/auth-provider';
import { holidaysForMonth, type Holiday, HOLIDAYS } from '../../lib/holidays';
import { showToast } from '../../components/InboxToast';

const WEEKDAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
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

export type EntryType = 'event' | 'task' | 'birthday' | 'period';

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
  type?: EntryType | string;
  color?: string;
  recurrence?: string;
  reminders?: string[];
  attendees?: string[];
  completed?: boolean;
  priority?: 'low' | 'medium' | 'urgent';
  subtasks?: Array<{ text: string; done: boolean }>;
  flowIntensity?: 'light' | 'medium' | 'heavy' | 'spotting';
  symptoms?: string[];
  moods?: string[];
  cycleDay?: number;
  accountEmail?: string;
  driveLink?: string;
  timezone?: string;
}

const startOf = (event: CalendarEventLike) => new Date(event.startTime ?? event.start ?? '');
const endOf = (event: CalendarEventLike) => new Date(event.endTime ?? event.end ?? '');
const hhmm = (date: Date) =>
  Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const toDateInput = (date: Date) =>
  `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;

type CalendarView = 'agenda' | 'week' | 'day' | 'month';

const TIMEZONES = [
  { label: 'India Standard Time (IST, UTC+5:30)', value: 'Asia/Kolkata' },
  { label: 'Greenwich Mean Time (UTC / GMT+0)', value: 'UTC' },
  { label: 'US Eastern Time (EDT/EST, UTC-4)', value: 'America/New_York' },
  { label: 'US Central Time (CDT/CST, UTC-5)', value: 'America/Chicago' },
  { label: 'US Pacific Time (PDT/PST, UTC-7)', value: 'America/Los_Angeles' },
  { label: 'British Summer Time (BST, UTC+1)', value: 'Europe/London' },
  { label: 'Central European Time (CEST, UTC+2)', value: 'Europe/Berlin' },
  { label: 'Gulf Standard Time (GST, UTC+4)', value: 'Asia/Dubai' },
  { label: 'Singapore / Hong Kong (SGT/HKT, UTC+8)', value: 'Asia/Singapore' },
  { label: 'Japan Standard Time (JST, UTC+9)', value: 'Asia/Tokyo' },
  { label: 'Australian Eastern Time (AEST, UTC+10)', value: 'Australia/Sydney' },
];

const RECURRENCE_OPTIONS = [
  'Does not repeat',
  'Daily',
  'Every weekday (Monday to Friday)',
  'Weekly',
  'Monthly',
  'Annually (Every year)',
  'Custom interval…',
];

// Clue / Flo reference moods and feelings
const CLUE_MOODS = [
  { id: 'mood_swings', label: 'Mood swings', icon: '⛅' },
  { id: 'not_in_control', label: 'Not in control', icon: '🌀' },
  { id: 'fine', label: 'Fine', icon: '☁️' },
  { id: 'happy', label: 'Happy', icon: '☀️' },
  { id: 'sad', label: 'Sad', icon: '🌧️' },
  { id: 'sensitive', label: 'Sensitive', icon: '💨' },
  { id: 'angry', label: 'Angry', icon: '⚡' },
  { id: 'confident', label: 'Confident', icon: '🌞' },
  { id: 'excited', label: 'Excited', icon: '✨' },
  { id: 'irritable', label: 'Irritable', icon: '🌩️' },
  { id: 'anxious', label: 'Anxious', icon: '🌪️' },
  { id: 'insecure', label: 'Insecure', icon: '🌧️' },
  { id: 'grateful', label: 'Grateful', icon: '🌅' },
  { id: 'indifferent', label: 'Indifferent', icon: '🌙' },
];

const PERIOD_SYMPTOMS = [
  '⚡ Cramps',
  '🤕 Headache',
  '😴 Fatigue',
  '🎈 Bloating',
  '🍫 Cravings',
  '💆 Backache',
  '💧 Spotting',
  '☕ Low Energy',
  '🔥 Tender Breasts',
  '🌸 Clear Skin',
];

const NOTIFICATION_SLIDER_VALUES = [
  { minutes: 5, label: '5 minutes before' },
  { minutes: 10, label: '10 minutes before' },
  { minutes: 15, label: '15 minutes before' },
  { minutes: 30, label: '30 minutes before' },
  { minutes: 45, label: '45 minutes before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 120, label: '2 hours before' },
  { minutes: 1440, label: '1 day before' },
  { minutes: 2880, label: '2 days before' },
  { minutes: 10080, label: '1 week before' },
];

export default function CalendarPage() {
  const today = useMemo(() => new Date(), []);
  const { user } = useAuth();
  const currentUserEmail = user?.email || 'kundan@quantmail.in';

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [activeView, setActiveView] = useState<CalendarView>('agenda');
  const [isMonthExpanded, setIsMonthExpanded] = useState(false);

  // Speed Dial FAB State
  const [isFabOpen, setIsFabOpen] = useState(false);

  // Active Creation Sheet Type (Dedicated sheet per mode)
  const [activeSheetType, setActiveSheetType] = useState<EntryType | null>(null);

  const [selectedEvent, setSelectedEvent] = useState<CalendarEventLike | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Selector sheets / modals
  const [isTimezoneModalOpen, setIsTimezoneModalOpen] = useState(false);
  const [isRecurrenceModalOpen, setIsRecurrenceModalOpen] = useState(false);
  const [isNotificationSliderOpen, setIsNotificationSliderOpen] = useState(false);
  const [notifSliderIndex, setNotifSliderIndex] = useState(3); // default 30 min

  // Infinite agenda loading states & buffer
  const [isLoadingPast, setIsLoadingPast] = useState(false);
  const [isLoadingFuture, setIsLoadingFuture] = useState(false);
  const [agendaRangeDays, setAgendaRangeDays] = useState({ past: 45, future: 90 });

  // Rich Entry Form State
  const [formState, setFormState] = useState<{
    title: string;
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    allDay: boolean;
    timezone: string;
    location: string;
    description: string;
    recurrence: string;
    color: string;
    accountEmail: string;
    notifications: string[];
    attendeeInput: string;
    attendees: string[];
    driveLink: string;
    // Task specific
    priority: 'low' | 'medium' | 'urgent';
    subtaskInput: string;
    subtasks: Array<{ text: string; done: boolean }>;
    // Birthday specific
    birthYear: string;
    giftIdeas: string;
    // Period tracker specific:
    flowIntensity: 'light' | 'medium' | 'heavy' | 'spotting';
    symptoms: string[];
    moods: string[];
    periodDays: number;
    cycleLength: number;
    currentCycleDay: number;
  }>({
    title: '',
    startDate: toDateInput(new Date()),
    endDate: toDateInput(new Date()),
    startTime: '10:00',
    endTime: '11:00',
    allDay: false,
    timezone: 'Asia/Kolkata',
    location: '',
    description: '',
    recurrence: 'Does not repeat',
    color: '#3b82f6',
    accountEmail: currentUserEmail,
    notifications: ['30 minutes before'],
    attendeeInput: '',
    attendees: [],
    driveLink: '',
    priority: 'medium',
    subtaskInput: '',
    subtasks: [],
    birthYear: '',
    giftIdeas: '',
    flowIntensity: 'medium',
    symptoms: ['⚡ Cramps'],
    moods: ['Happy', 'Fine'],
    periodDays: 5,
    cycleLength: 28,
    currentCycleDay: 1,
  });

  useEffect(() => {
    if (currentUserEmail) {
      setFormState((prev) => ({ ...prev, accountEmail: currentUserEmail }));
    }
  }, [currentUserEmail]);

  // Real-time 1:1 Physics Drag State for Create Bottom Sheet
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [sheetDragY, setSheetDragY] = useState(0);
  const [isSheetDragging, setIsSheetDragging] = useState(false);
  const sheetPointerRef = useRef<{ startY: number; time: number } | null>(null);

  const scrollHostRef = useRef<HTMLDivElement>(null);
  const dateItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const isProgrammaticScrollRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Active month/year for top navigation headers based on selected date
  const activeMonthName = MONTH_NAMES[selectedDate.getMonth()];
  const activeYear = selectedDate.getFullYear();

  // Broad cached window so queries stay cached
  const start = useMemo(
    () => new Date(today.getFullYear(), today.getMonth() - 8, 1).toISOString(),
    [today],
  );
  const end = useMemo(
    () => new Date(today.getFullYear(), today.getMonth() + 10, 0, 23, 59, 59).toISOString(),
    [today],
  );

  const { data: rawEvents, isLoading, error, refetch } = useCalendarEvents({ start, end });
  const events = (rawEvents ?? []) as unknown as CalendarEventLike[];
  const isInitialLoading = isLoading && !rawEvents;

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

  // Current active 1-week strip (7 days computed directly from selectedDate: Sunday to Saturday)
  const currentWeekDays = useMemo(() => {
    const current = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
    );
    const dayOfWeek = current.getDay();
    const sunday = new Date(current);
    sunday.setDate(current.getDate() - dayOfWeek);

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      const isSelected = dayKey(d) === dayKey(selectedDate);
      const isToday = dayKey(d) === dayKey(today);
      const isCurrentSelectedMonth = d.getMonth() === selectedDate.getMonth();
      return {
        date: d,
        dayNum: d.getDate(),
        dayLetter: WEEKDAYS_SHORT[i],
        isSelected,
        isToday,
        isCurrentMonth: isCurrentSelectedMonth,
        key: dayKey(d),
      };
    });
  }, [selectedDate, today]);

  // Month grid weeks data structure for full month expanded mode
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

  const scrollToDate = useCallback((date: Date) => {
    const key = dayKey(date);
    const target = dateItemRefs.current.get(key);
    if (target) {
      isProgrammaticScrollRef.current = true;
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      scrollTimeoutRef.current = setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 700);
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
    setCurrentDate((curr) => {
      const nextDate = new Date(curr.getFullYear(), curr.getMonth() + delta, 1);
      setSelectedDate(nextDate);
      return nextDate;
    });
  }, []);

  const goToday = useCallback(() => {
    const now = new Date();
    setSelectedDate(now);
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
    scrollToDate(now);
  }, [scrollToDate]);

  // Dimension Constants for direct 1:1 finger tracking
  const COLLAPSED_HEIGHT = 104;
  const EXPANDED_HEIGHT = 336;

  // Interactive real-time drag state for top calendar drawer
  const [isDragging, setIsDragging] = useState(false);
  const [currentHeight, setCurrentHeight] = useState(COLLAPSED_HEIGHT);
  const pointerStartRef = useRef<{
    startY: number;
    startHeight: number;
    startX: number;
    time: number;
  } | null>(null);

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

      if (Math.abs(deltaY) < 6 && Math.abs(deltaX) < 6 && duration < 300) {
        setIsMonthExpanded((prev) => !prev);
        return;
      }

      if (Math.abs(deltaX) > 35 && Math.abs(deltaX) > Math.abs(deltaY)) {
        if (deltaX < 0) goMonth(1);
        else goMonth(-1);
        return;
      }

      const midpoint = (COLLAPSED_HEIGHT + EXPANDED_HEIGHT) / 2;
      if (velocityY > 0.25 || currentHeight > midpoint + 20) {
        setIsMonthExpanded(true);
        setCurrentHeight(EXPANDED_HEIGHT);
      } else if (velocityY < -0.25 || currentHeight < midpoint - 20) {
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

  // Bottom Sheet 1:1 Direct Finger Physics Handlers
  const handleSheetPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    sheetPointerRef.current = {
      startY: e.clientY,
      time: Date.now(),
    };
    setIsSheetDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }, []);

  const handleSheetPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!sheetPointerRef.current) return;
    const deltaY = e.clientY - sheetPointerRef.current.startY;
    setSheetDragY(deltaY);
  }, []);

  const handleSheetPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!sheetPointerRef.current) return;
      const deltaY = e.clientY - sheetPointerRef.current.startY;
      const duration = Date.now() - sheetPointerRef.current.time;
      const velocityY = deltaY / (duration || 1);

      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }

      sheetPointerRef.current = null;
      setIsSheetDragging(false);
      setSheetDragY(0);

      if (Math.abs(deltaY) < 8 && duration < 250) {
        setSheetExpanded((prev) => !prev);
        return;
      }

      if (deltaY > 100 || velocityY > 0.35) {
        if (sheetExpanded && deltaY < 180) {
          setSheetExpanded(false);
        } else {
          setActiveSheetType(null);
          setSheetExpanded(false);
        }
        return;
      }

      if (deltaY < -60 || velocityY < -0.35) {
        setSheetExpanded(true);
        return;
      }
    },
    [sheetExpanded],
  );

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

      const dayEvents = eventsByDay[key] ?? [];

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

  // Open Dedicated Sheet for a specific type directly from Speed Dial FAB
  const openDedicatedSheet = useCallback(
    (type: EntryType, date?: Date) => {
      const base = date ? new Date(date) : new Date(selectedDate);
      const dateStr = toDateInput(base);

      setFormState({
        title: '',
        startDate: dateStr,
        endDate: dateStr,
        startTime: '10:00',
        endTime: '11:00',
        allDay: type === 'birthday' || type === 'period',
        timezone: 'Asia/Kolkata',
        location: '',
        description: '',
        recurrence:
          type === 'birthday'
            ? 'Annually'
            : type === 'period'
              ? 'Every 28 days'
              : 'Does not repeat',
        color: type === 'period' ? '#ec4899' : type === 'birthday' ? '#10b981' : '#3b82f6',
        accountEmail: currentUserEmail,
        notifications:
          type === 'birthday'
            ? ['1 week before at 9 AM', 'On the day at 9 AM']
            : ['30 minutes before'],
        attendeeInput: '',
        attendees: [],
        driveLink: '',
        priority: 'medium',
        subtaskInput: '',
        subtasks: [],
        birthYear: '',
        giftIdeas: '',
        flowIntensity: 'medium',
        symptoms: ['⚡ Cramps'],
        moods: ['Happy'],
        periodDays: 5,
        cycleLength: 28,
        currentCycleDay: 1,
      });

      setIsFabOpen(false);
      setSheetDragY(0);
      setSheetExpanded(type === 'period'); // Period tracker opens in expansive view
      setActiveSheetType(type);
    },
    [selectedDate, currentUserEmail],
  );

  useEffect(() => {
    const handler = () => openDedicatedSheet('event');
    window.addEventListener('quant:calendar:create', handler);
    return () => window.removeEventListener('quant:calendar:create', handler);
  }, [openDedicatedSheet]);

  const handleSaveEntry = useCallback(async () => {
    if (!activeSheetType) return;
    if (!formState.title.trim() && activeSheetType !== 'period') return;

    let finalTitle = formState.title.trim();
    if (activeSheetType === 'period') {
      finalTitle =
        finalTitle || `🌸 Cycle Day ${formState.currentCycleDay} (${formState.flowIntensity} flow)`;
    }

    let startIso: string;
    let endIso: string;

    if (formState.allDay) {
      startIso = new Date(`${formState.startDate}T00:00:00`).toISOString();
      endIso = new Date(`${formState.endDate || formState.startDate}T23:59:59`).toISOString();
    } else {
      startIso = new Date(`${formState.startDate}T${formState.startTime}:00`).toISOString();
      endIso = new Date(
        `${formState.endDate || formState.startDate}T${formState.endTime}:00`,
      ).toISOString();
    }

    const payload = {
      title: finalTitle,
      startTime: startIso,
      endTime: endIso,
      start: startIso,
      end: endIso,
      description:
        formState.description ||
        (activeSheetType === 'period' ? `Moods: ${formState.moods.join(', ')}` : ''),
      location: formState.location,
      allDay: formState.allDay,
      type: activeSheetType,
      color: formState.color,
      recurrence: formState.recurrence,
      reminders: formState.notifications,
      attendees: formState.attendees,
      accountEmail: formState.accountEmail,
      timezone: formState.timezone,
      driveLink: formState.driveLink,
      priority: activeSheetType === 'task' ? formState.priority : undefined,
      subtasks: activeSheetType === 'task' ? formState.subtasks : undefined,
      flowIntensity: activeSheetType === 'period' ? formState.flowIntensity : undefined,
      symptoms: activeSheetType === 'period' ? formState.symptoms : undefined,
      moods: activeSheetType === 'period' ? formState.moods : undefined,
      cycleDay: activeSheetType === 'period' ? formState.currentCycleDay : undefined,
    };

    try {
      await createEvent.mutateAsync(payload as never);
      setActiveSheetType(null);
      showToast({
        text: `${activeSheetType === 'task' ? 'Task' : activeSheetType === 'birthday' ? 'Birthday' : activeSheetType === 'period' ? 'Cycle entry' : 'Event'} "${finalTitle}" saved`,
        type: 'success',
      });
      await refetch();
    } catch {
      showToast({ text: 'Failed to save entry', type: 'error' });
    }
  }, [activeSheetType, formState, createEvent, refetch]);

  const handleDeleteEvent = useCallback(
    async (id: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (confirm('Delete this entry?')) {
        try {
          await deleteEvent.mutateAsync(id);
          setSelectedEvent(null);
          showToast({ text: 'Entry deleted', type: 'info' });
          await refetch();
        } catch {
          showToast({ text: 'Failed to delete entry', type: 'error' });
        }
      }
    },
    [deleteEvent, refetch],
  );

  const handleAddMeetLink = () => {
    const roomId = `meet-${Math.random().toString(36).substring(2, 8)}`;
    setFormState((prev) => ({
      ...prev,
      location: `https://meet.quantrinity.in/${roomId}`,
    }));
    showToast({ text: 'Generated QuantMeet / QuantChat Meeting Link', type: 'info' });
  };

  const handleAddAttendee = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = formState.attendeeInput.trim().replace(',', '');
      if (val && !formState.attendees.includes(val)) {
        setFormState((prev) => ({
          ...prev,
          attendees: [...prev.attendees, val],
          attendeeInput: '',
        }));
      }
    }
  };

  const removeAttendee = (email: string) => {
    setFormState((prev) => ({
      ...prev,
      attendees: prev.attendees.filter((a) => a !== email),
    }));
  };

  const addNotificationReminder = (timeText: string) => {
    if (!formState.notifications.includes(timeText)) {
      setFormState((prev) => ({
        ...prev,
        notifications: [...prev.notifications, timeText],
      }));
    }
  };

  const removeNotificationReminder = (index: number) => {
    setFormState((prev) => ({
      ...prev,
      notifications: prev.notifications.filter((_, i) => i !== index),
    }));
  };

  const toggleSymptom = (symptom: string) => {
    setFormState((prev) => ({
      ...prev,
      symptoms: prev.symptoms.includes(symptom)
        ? prev.symptoms.filter((s) => s !== symptom)
        : [...prev.symptoms, symptom],
    }));
  };

  const toggleMood = (moodLabel: string) => {
    setFormState((prev) => ({
      ...prev,
      moods: prev.moods.includes(moodLabel)
        ? prev.moods.filter((m) => m !== moodLabel)
        : [...prev.moods, moodLabel],
    }));
  };

  const handleAddSubtask = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && formState.subtaskInput.trim()) {
      e.preventDefault();
      setFormState((prev) => ({
        ...prev,
        subtasks: [...prev.subtasks, { text: prev.subtaskInput.trim(), done: false }],
        subtaskInput: '',
      }));
    }
  };

  const toggleSubtask = (idx: number) => {
    setFormState((prev) => ({
      ...prev,
      subtasks: prev.subtasks.map((st, i) => (i === idx ? { ...st, done: !st.done } : st)),
    }));
  };

  // Symmetrical bi-directional scroll listener for agenda with loading indicators
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const host = e.currentTarget;
      const { scrollTop, scrollHeight, clientHeight } = host;

      if (scrollHeight - scrollTop - clientHeight < 350 && !isLoadingFuture) {
        setIsLoadingFuture(true);
        setTimeout(() => {
          setAgendaRangeDays((prev) => ({ ...prev, future: prev.future + 30 }));
          setIsLoadingFuture(false);
        }, 250);
      }

      if (scrollTop < 120 && !isLoadingPast) {
        setIsLoadingPast(true);
        const prevScrollHeight = host.scrollHeight;
        setTimeout(() => {
          setAgendaRangeDays((prev) => {
            const next = { ...prev, past: prev.past + 30 };
            requestAnimationFrame(() => {
              if (scrollHostRef.current) {
                const newScrollHeight = scrollHostRef.current.scrollHeight;
                scrollHostRef.current.scrollTop += newScrollHeight - prevScrollHeight;
              }
            });
            return next;
          });
          setIsLoadingPast(false);
        }, 250);
      }

      if (!isProgrammaticScrollRef.current && scrollHostRef.current) {
        const containerRect = scrollHostRef.current.getBoundingClientRect();
        const targetY = containerRect.top + 45;

        for (const item of continuousAgendaDays) {
          const el = dateItemRefs.current.get(item.key);
          if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.top <= targetY && rect.bottom > targetY) {
              const itemDate = item.date;
              if (dayKey(itemDate) !== dayKey(selectedDate)) {
                setSelectedDate(itemDate);
                if (
                  itemDate.getMonth() !== currentDate.getMonth() ||
                  itemDate.getFullYear() !== currentDate.getFullYear()
                ) {
                  setCurrentDate(new Date(itemDate.getFullYear(), itemDate.getMonth(), 1));
                }
              }
              break;
            }
          }
        }
      }
    },
    [continuousAgendaDays, selectedDate, currentDate, isLoadingPast, isLoadingFuture],
  );

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
            <span>{activeMonthName}</span>
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
              placeholder="Search events, meetings, tasks, birthdays…"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#3b82f6]"
              autoFocus
            />
          </div>
        )}

        {/* Desktop Header Toolbar */}
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
              {activeMonthName} <span className="text-zinc-400 font-normal">{activeYear}</span>
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

            <Button variant="primary" onClick={() => openDedicatedSheet('event')}>
              + New Entry
            </Button>
          </div>
        </div>

        {/* Outlook-Style Interactive Expandable Date Picker with 1:1 Direct Finger Physics */}
        <div
          className="border-b border-zinc-800 bg-[#161618] select-none overflow-hidden relative"
          style={{
            height: `${currentHeight}px`,
            transition: isDragging ? 'none' : 'height 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
            touchAction: 'none',
          }}
        >
          <div className="flex flex-col h-full justify-between px-3 pt-2 pb-1">
            {isMonthExpanded && (
              <div className="flex items-center justify-between px-2 pb-1">
                <span className="text-xs font-bold text-zinc-200">
                  {MONTH_NAMES[month]} {year}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => goMonth(-1)}
                    className="size-7 text-sm text-zinc-400 hover:text-white rounded hover:bg-zinc-800 flex items-center justify-center"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => goMonth(1)}
                    className="size-7 text-sm text-zinc-400 hover:text-white rounded hover:bg-zinc-800 flex items-center justify-center"
                  >
                    ›
                  </button>
                </div>
              </div>
            )}

            {/* Weekday Label Headers */}
            <div className="grid grid-cols-7 text-center py-1">
              {WEEKDAYS_SHORT.map((d, i) => (
                <div key={i} className="text-[11px] font-semibold text-zinc-400">
                  {d}
                </div>
              ))}
            </div>

            {/* Date Numbers Strip / Grid */}
            <div className="flex-1 overflow-hidden">
              {!isMonthExpanded ? (
                <div className="grid grid-cols-7 text-center h-[46px] items-center">
                  {currentWeekDays.map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => selectDate(d.date)}
                      className="flex items-center justify-center py-0.5 focus:outline-none"
                    >
                      <span
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                          d.isSelected
                            ? 'bg-[#3b82f6] text-white shadow-lg scale-105'
                            : d.isToday
                              ? 'border-2 border-[#3b82f6] text-[#3b82f6]'
                              : d.isCurrentMonth
                                ? 'text-zinc-200 hover:bg-zinc-800'
                                : 'text-zinc-500'
                        }`}
                      >
                        {d.dayNum}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-0.5 pt-0.5">
                  {monthWeeks.map((week, weekIdx) => (
                    <div
                      key={`month-week-${weekIdx}`}
                      className="grid grid-cols-7 text-center h-[38px] items-center"
                    >
                      {week.map((d) => (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() => selectDate(d.date)}
                          className="flex items-center justify-center py-0.5 focus:outline-none"
                        >
                          <span
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
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
                  ))}
                </div>
              )}
            </div>

            {/* Bottom Drag Handle */}
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="w-full flex flex-col items-center justify-center py-1.5 cursor-grab active:cursor-grabbing group select-none touch-none"
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
          {isLoadingPast && (
            <div className="flex items-center justify-center gap-2 py-2 text-xs font-semibold text-[#3b82f6] animate-pulse">
              <svg className="animate-spin size-4" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span>Loading earlier dates…</span>
            </div>
          )}

          {isInitialLoading && (
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

          {!isInitialLoading && !error && (
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
                    {/* Day Heading */}
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

                    {/* Content under Day */}
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

                      {/* Scheduled Events, Tasks, Birthdays, Period tracker */}
                      {item.events.map((ev) => {
                        const isTask = ev.type === 'task';
                        const isBirthday = ev.type === 'birthday';
                        const isPeriod = ev.type === 'period';

                        return (
                          <div
                            key={ev.id}
                            onClick={() => setSelectedEvent(ev)}
                            className="flex items-center justify-between p-3 rounded-xl border border-zinc-800 bg-zinc-900 hover:border-[#3b82f6]/50 transition-colors cursor-pointer shadow-sm"
                          >
                            <div className="flex items-start gap-2.5">
                              {/* Type Icon / Indicator */}
                              {isTask ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    showToast({
                                      text: `Task "${ev.title}" completed`,
                                      type: 'success',
                                    });
                                  }}
                                  className="size-4 rounded border border-zinc-500 hover:border-[#3b82f6] mt-0.5 flex items-center justify-center text-[10px] text-transparent hover:text-white"
                                >
                                  ✓
                                </button>
                              ) : isBirthday ? (
                                <span className="text-sm">🎂</span>
                              ) : isPeriod ? (
                                <span className="text-sm">🌸</span>
                              ) : (
                                <span className="size-2.5 rounded-full mt-1.5 shrink-0 bg-[#3b82f6]" />
                              )}

                              <div>
                                <div className="flex items-center gap-1.5">
                                  <h5 className="text-xs font-bold text-white">{ev.title}</h5>
                                  {isPeriod && ev.flowIntensity && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-pink-500/20 text-pink-300 font-semibold uppercase">
                                      {ev.flowIntensity}
                                    </span>
                                  )}
                                  {isBirthday && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-semibold">
                                      Birthday
                                    </span>
                                  )}
                                </div>

                                <p className="text-[11px] text-zinc-400 mt-0.5">
                                  {ev.allDay
                                    ? 'All Day'
                                    : `${hhmm(startOf(ev))} – ${hhmm(endOf(ev))}`}
                                  {ev.location ? ` · 📍 ${ev.location}` : ''}
                                  {ev.symptoms && ev.symptoms.length > 0
                                    ? ` · ${ev.symptoms.join(', ')}`
                                    : ''}
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
                        );
                      })}

                      {/* Empty State */}
                      {!hasEvents && !hasHolidays && (
                        <div
                          onClick={() => openDedicatedSheet('event', item.date)}
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

          {isLoadingFuture && (
            <div className="flex items-center justify-center gap-2 py-4 text-xs font-semibold text-[#3b82f6] animate-pulse">
              <svg className="animate-spin size-4" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span>Loading upcoming dates…</span>
            </div>
          )}
        </div>

        {/* Speed Dial Menu + Floating Action Button */}
        <div className="fixed bottom-20 right-4 md:hidden z-40 flex flex-col items-end gap-2.5">
          <AnimatePresence>
            {isFabOpen && (
              <motion.div
                initial={{ opacity: 0, y: 15, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 15, scale: 0.9 }}
                transition={{ duration: 0.18 }}
                className="flex flex-col items-end gap-2.5 mb-1"
              >
                {/* Birthday Pill */}
                <button
                  type="button"
                  onClick={() => openDedicatedSheet('birthday')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#1e293b] hover:bg-[#334155] text-white text-xs font-bold shadow-xl border border-zinc-700/60 active:scale-95 transition-all"
                >
                  <span className="text-sm">🎂</span>
                  <span>Birthday</span>
                </button>

                {/* Task Pill */}
                <button
                  type="button"
                  onClick={() => openDedicatedSheet('task')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#1e293b] hover:bg-[#334155] text-white text-xs font-bold shadow-xl border border-zinc-700/60 active:scale-95 transition-all"
                >
                  <span className="text-sm">🎯</span>
                  <span>Task</span>
                </button>

                {/* Period Tracker Pill */}
                <button
                  type="button"
                  onClick={() => openDedicatedSheet('period')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-pink-950/90 hover:bg-pink-900 text-pink-200 text-xs font-bold shadow-xl border border-pink-500/40 active:scale-95 transition-all"
                >
                  <span className="text-sm">🌸</span>
                  <span>Period Tracker</span>
                </button>

                {/* Event Pill */}
                <button
                  type="button"
                  onClick={() => openDedicatedSheet('event')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold shadow-xl active:scale-95 transition-all"
                >
                  <span className="text-sm">📅</span>
                  <span>Event</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="button"
            onClick={() => setIsFabOpen((prev) => !prev)}
            className={`size-14 rounded-full font-bold shadow-2xl flex items-center justify-center active:scale-95 transition-all focus:outline-none ${
              isFabOpen
                ? 'bg-zinc-800 text-white rotate-45'
                : 'bg-[#3b82f6] hover:bg-[#2563eb] text-white'
            }`}
            aria-label="Toggle calendar speed dial"
          >
            <svg
              className="size-6 transition-transform duration-200"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        {/* Dedicated Slide-up Sheets for each Type */}
        <AnimatePresence>
          {activeSheetType && (
            <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setActiveSheetType(null)}
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              />

              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: isSheetDragging ? Math.max(-40, sheetDragY) : 0 }}
                exit={{ y: '100%' }}
                transition={
                  isSheetDragging
                    ? { duration: 0 }
                    : { type: 'spring', damping: 28, stiffness: 300 }
                }
                className={`relative w-full max-w-lg bg-[#1c1b20] border-t md:border border-zinc-800 rounded-t-3xl md:rounded-3xl shadow-2xl z-10 flex flex-col transition-all overflow-hidden ${
                  sheetExpanded || activeSheetType === 'period'
                    ? 'h-[94vh]'
                    : 'max-h-[88vh] md:max-h-[85vh]'
                }`}
              >
                {/* Drag Handle & Top Header */}
                <div
                  onPointerDown={handleSheetPointerDown}
                  onPointerMove={handleSheetPointerMove}
                  onPointerUp={handleSheetPointerUp}
                  onPointerCancel={handleSheetPointerUp}
                  className="pt-2.5 pb-1 px-4 flex flex-col cursor-grab active:cursor-grabbing select-none touch-none"
                  style={{ touchAction: 'none' }}
                >
                  <div
                    className={`w-14 h-1.5 rounded-full mx-auto mb-2 transition-all ${
                      isSheetDragging ? 'bg-[#3b82f6] scale-110' : 'bg-zinc-600 hover:bg-zinc-400'
                    }`}
                  />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveSheetType(null)}
                        className="size-9 rounded-full hover:bg-zinc-800 text-zinc-300 hover:text-white flex items-center justify-center text-lg transition-colors"
                      >
                        ✕
                      </button>
                      <span className="text-sm font-bold text-white flex items-center gap-1.5">
                        {activeSheetType === 'event' && <span>📅 New Event</span>}
                        {activeSheetType === 'task' && <span>🎯 New Task</span>}
                        {activeSheetType === 'birthday' && <span>🎂 New Birthday</span>}
                        {activeSheetType === 'period' && <span>🌸 Period & Cycle Tracker</span>}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleSaveEntry()}
                      className={`px-5 py-1.5 rounded-full text-white font-bold text-xs shadow-md transition-all active:scale-95 ${
                        activeSheetType === 'period'
                          ? 'bg-pink-600 hover:bg-pink-500'
                          : 'bg-[#3b82f6] hover:bg-[#2563eb]'
                      }`}
                    >
                      Save
                    </button>
                  </div>
                </div>

                {/* Form Content */}
                <div className="flex-1 overflow-y-auto px-5 py-2 space-y-4 text-xs text-white">
                  {/* Account Row */}
                  <div className="flex items-center justify-between py-1 border-b border-zinc-800/60 text-zinc-300">
                    <span className="text-xs text-zinc-400">Account</span>
                    <span className="text-[11px] font-medium text-[#3b82f6] bg-[#3b82f6]/10 px-2.5 py-0.5 rounded-full border border-[#3b82f6]/20">
                      👤 {formState.accountEmail || currentUserEmail}
                    </span>
                  </div>

                  {/* ----------------- 1. EVENT FORM ----------------- */}
                  {activeSheetType === 'event' && (
                    <div className="space-y-4">
                      <div>
                        <input
                          type="text"
                          value={formState.title}
                          onChange={(e) => setFormState({ ...formState, title: e.target.value })}
                          placeholder="Add event title"
                          className="w-full bg-transparent text-xl font-medium text-white placeholder-zinc-500 border-b border-zinc-700/80 pb-2 focus:outline-none focus:border-[#3b82f6]"
                          autoFocus
                        />
                      </div>

                      {/* All-Day Switch */}
                      <div className="flex items-center justify-between py-2 border-b border-zinc-800/60">
                        <div className="flex items-center gap-2.5 text-zinc-300">
                          <span className="text-base">🕒</span>
                          <span className="font-medium">All-day</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFormState({ ...formState, allDay: !formState.allDay })}
                          className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                            formState.allDay ? 'bg-[#3b82f6]' : 'bg-zinc-700'
                          }`}
                        >
                          <div
                            className={`bg-white size-4 rounded-full shadow-md transform transition-transform ${
                              formState.allDay ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      {/* Date & Time */}
                      <div className="space-y-2 py-1">
                        <div className="flex items-center justify-between">
                          <input
                            type="date"
                            value={formState.startDate}
                            onChange={(e) =>
                              setFormState({ ...formState, startDate: e.target.value })
                            }
                            className="bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-1.5 text-xs text-white"
                          />
                          {!formState.allDay && (
                            <input
                              type="time"
                              value={formState.startTime}
                              onChange={(e) =>
                                setFormState({ ...formState, startTime: e.target.value })
                              }
                              className="bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-1.5 text-xs text-white"
                            />
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <input
                            type="date"
                            value={formState.endDate}
                            onChange={(e) =>
                              setFormState({ ...formState, endDate: e.target.value })
                            }
                            className="bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-1.5 text-xs text-white"
                          />
                          {!formState.allDay && (
                            <input
                              type="time"
                              value={formState.endTime}
                              onChange={(e) =>
                                setFormState({ ...formState, endTime: e.target.value })
                              }
                              className="bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-1.5 text-xs text-white"
                            />
                          )}
                        </div>
                      </div>

                      {/* Timezone */}
                      <button
                        type="button"
                        onClick={() => setIsTimezoneModalOpen(true)}
                        className="w-full flex items-center justify-between text-left text-zinc-300 hover:text-white py-2 border-b border-zinc-800/60"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-base">🌐</span>
                          <span>
                            {TIMEZONES.find((tz) => tz.value === formState.timezone)?.label ||
                              'India Standard Time (IST)'}
                          </span>
                        </div>
                        <span className="text-zinc-500 text-xs">›</span>
                      </button>

                      {/* Recurrence */}
                      <button
                        type="button"
                        onClick={() => setIsRecurrenceModalOpen(true)}
                        className="w-full flex items-center justify-between text-left text-zinc-300 hover:text-white py-2 border-b border-zinc-800/60"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-base">🔁</span>
                          <span>{formState.recurrence}</span>
                        </div>
                        <span className="text-zinc-500 text-xs">›</span>
                      </button>

                      {/* People */}
                      <div className="py-2 border-b border-zinc-800/60 space-y-2">
                        <div className="flex items-center gap-2.5 text-zinc-300">
                          <span className="text-base">👥</span>
                          <input
                            type="email"
                            placeholder="Add guests (type email & enter)"
                            value={formState.attendeeInput}
                            onChange={(e) =>
                              setFormState({ ...formState, attendeeInput: e.target.value })
                            }
                            onKeyDown={handleAddAttendee}
                            className="flex-1 bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none"
                          />
                        </div>
                        {formState.attendees.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pl-7">
                            {formState.attendees.map((email) => (
                              <span
                                key={email}
                                className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-200 text-[11px]"
                              >
                                <span>{email}</span>
                                <button
                                  type="button"
                                  onClick={() => removeAttendee(email)}
                                  className="text-zinc-400 hover:text-rose-400"
                                >
                                  ✕
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* QuantMeet Video */}
                      <div className="flex items-center justify-between py-2 border-b border-zinc-800/60">
                        <div className="flex items-center gap-2.5 text-zinc-300">
                          <span className="text-base">🎥</span>
                          <button
                            type="button"
                            onClick={handleAddMeetLink}
                            className="text-xs text-[#3b82f6] hover:underline font-semibold"
                          >
                            + Add QuantMeet / QuantChat video conferencing
                          </button>
                        </div>
                      </div>

                      {/* Location */}
                      <div className="py-2 border-b border-zinc-800/60 space-y-1.5">
                        <div className="flex items-center gap-2.5 text-zinc-300">
                          <span className="text-base">📍</span>
                          <input
                            type="text"
                            placeholder="Add location or QuantChat room"
                            value={formState.location}
                            onChange={(e) =>
                              setFormState({ ...formState, location: e.target.value })
                            }
                            className="flex-1 bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none"
                          />
                        </div>
                        <div className="flex items-center gap-1.5 pl-7">
                          {['🏢 QuantHQ Main', '💬 QuantChat Room', '🏠 Remote / WFH'].map(
                            (loc) => (
                              <button
                                key={loc}
                                type="button"
                                onClick={() => setFormState({ ...formState, location: loc })}
                                className="px-2 py-0.5 rounded-md bg-zinc-800 text-[10px] text-zinc-400 hover:text-white"
                              >
                                {loc}
                              </button>
                            ),
                          )}
                        </div>
                      </div>

                      {/* Notifications with slider */}
                      <div className="py-2 border-b border-zinc-800/60 space-y-2">
                        <div className="flex items-center justify-between text-zinc-300">
                          <div className="flex items-center gap-2.5">
                            <span className="text-base">🔔</span>
                            <span>Notifications</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsNotificationSliderOpen(true)}
                            className="px-2.5 py-1 rounded-lg bg-[#3b82f6]/20 text-[#3b82f6] text-[11px] font-bold"
                          >
                            + Custom Time Slider
                          </button>
                        </div>
                        <div className="space-y-1.5 pl-7">
                          {formState.notifications.map((notif, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between text-[11px] text-zinc-400"
                            >
                              <span>{notif}</span>
                              <button
                                type="button"
                                onClick={() => removeNotificationReminder(idx)}
                                className="text-zinc-500 hover:text-rose-400"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Description */}
                      <div className="flex items-start gap-2.5 py-2 border-b border-zinc-800/60 text-zinc-300">
                        <span className="text-base mt-1">≡</span>
                        <textarea
                          rows={2}
                          placeholder="Add description, meeting agenda…"
                          value={formState.description}
                          onChange={(e) =>
                            setFormState({ ...formState, description: e.target.value })
                          }
                          className="flex-1 bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none resize-none"
                        />
                      </div>

                      {/* QuantDrive */}
                      <div className="py-2 space-y-1.5 text-zinc-300">
                        <div className="flex items-center gap-2.5">
                          <span className="text-base">📎</span>
                          <input
                            type="text"
                            placeholder="Attach QuantDrive file URL or link"
                            value={formState.driveLink}
                            onChange={(e) =>
                              setFormState({ ...formState, driveLink: e.target.value })
                            }
                            className="flex-1 bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ----------------- 2. TASK FORM ----------------- */}
                  {activeSheetType === 'task' && (
                    <div className="space-y-4">
                      <div>
                        <input
                          type="text"
                          value={formState.title}
                          onChange={(e) => setFormState({ ...formState, title: e.target.value })}
                          placeholder="Add task title"
                          className="w-full bg-transparent text-xl font-medium text-white placeholder-zinc-500 border-b border-zinc-700/80 pb-2 focus:outline-none focus:border-[#3b82f6]"
                          autoFocus
                        />
                      </div>

                      {/* Priority */}
                      <div className="flex items-center justify-between py-2 border-b border-zinc-800/60">
                        <span className="text-zinc-400">Priority</span>
                        <div className="flex items-center gap-1.5">
                          {(
                            [
                              { key: 'low', label: '🟢 Low' },
                              { key: 'medium', label: '🟡 Medium' },
                              { key: 'urgent', label: '🔴 Urgent' },
                            ] as const
                          ).map((p) => (
                            <button
                              key={p.key}
                              type="button"
                              onClick={() => setFormState({ ...formState, priority: p.key })}
                              className={`px-3 py-1 rounded-xl text-[11px] font-bold border transition-all ${
                                formState.priority === p.key
                                  ? 'bg-[#3b82f6]/30 border-[#3b82f6] text-white'
                                  : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                              }`}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Due Date & Time */}
                      <div className="flex items-center justify-between py-2 border-b border-zinc-800/60">
                        <div className="flex items-center gap-2 text-zinc-300">
                          <span>📅</span>
                          <span>Due Date</span>
                        </div>
                        <input
                          type="date"
                          value={formState.startDate}
                          onChange={(e) =>
                            setFormState({ ...formState, startDate: e.target.value })
                          }
                          className="bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-1.5 text-xs text-white"
                        />
                      </div>

                      {/* Subtasks Checklist */}
                      <div className="space-y-2 p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800">
                        <span className="font-bold text-zinc-300">Checklist & Subtasks</span>
                        <input
                          type="text"
                          placeholder="+ Add subtask (press Enter)"
                          value={formState.subtaskInput}
                          onChange={(e) =>
                            setFormState({ ...formState, subtaskInput: e.target.value })
                          }
                          onKeyDown={handleAddSubtask}
                          className="w-full bg-zinc-950 border border-zinc-700/80 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-500"
                        />
                        {formState.subtasks.map((st, idx) => (
                          <div
                            key={idx}
                            onClick={() => toggleSubtask(idx)}
                            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-zinc-950 text-xs cursor-pointer hover:bg-zinc-800"
                          >
                            <span
                              className={st.done ? 'text-emerald-400 font-bold' : 'text-zinc-500'}
                            >
                              {st.done ? '☑' : '☐'}
                            </span>
                            <span
                              className={st.done ? 'line-through text-zinc-500' : 'text-zinc-200'}
                            >
                              {st.text}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Task Notes */}
                      <div className="flex items-start gap-2.5 py-2 border-b border-zinc-800/60 text-zinc-300">
                        <span className="text-base mt-1">≡</span>
                        <textarea
                          rows={2}
                          placeholder="Add task notes or instructions…"
                          value={formState.description}
                          onChange={(e) =>
                            setFormState({ ...formState, description: e.target.value })
                          }
                          className="flex-1 bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none resize-none"
                        />
                      </div>
                    </div>
                  )}

                  {/* ----------------- 3. BIRTHDAY FORM ----------------- */}
                  {activeSheetType === 'birthday' && (
                    <div className="space-y-4">
                      <div>
                        <input
                          type="text"
                          value={formState.title}
                          onChange={(e) => setFormState({ ...formState, title: e.target.value })}
                          placeholder="Add person's name (e.g. Rahul's Birthday)"
                          className="w-full bg-transparent text-xl font-medium text-white placeholder-zinc-500 border-b border-zinc-700/80 pb-2 focus:outline-none focus:border-[#3b82f6]"
                          autoFocus
                        />
                      </div>

                      {/* Date of Birth */}
                      <div className="flex items-center justify-between py-2 border-b border-zinc-800/60">
                        <div className="flex items-center gap-2 text-zinc-300">
                          <span>🎂</span>
                          <span>Birthday Date</span>
                        </div>
                        <input
                          type="date"
                          value={formState.startDate}
                          onChange={(e) =>
                            setFormState({ ...formState, startDate: e.target.value })
                          }
                          className="bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-1.5 text-xs text-white"
                        />
                      </div>

                      {/* Birth Year */}
                      <div className="flex items-center justify-between py-2 border-b border-zinc-800/60">
                        <div className="flex items-center gap-2 text-zinc-300">
                          <span>📅</span>
                          <span>Birth Year (Optional)</span>
                        </div>
                        <input
                          type="number"
                          placeholder="e.g. 1998"
                          value={formState.birthYear}
                          onChange={(e) =>
                            setFormState({ ...formState, birthYear: e.target.value })
                          }
                          className="w-24 bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-1.5 text-xs text-white text-center"
                        />
                      </div>

                      {/* Gift Ideas & Notes */}
                      <div className="flex items-start gap-2.5 py-2 border-b border-zinc-800/60 text-zinc-300">
                        <span className="text-base mt-1">🎁</span>
                        <textarea
                          rows={2}
                          placeholder="Gift ideas, party venue, wishlist notes…"
                          value={formState.description}
                          onChange={(e) =>
                            setFormState({ ...formState, description: e.target.value })
                          }
                          className="flex-1 bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none resize-none"
                        />
                      </div>
                    </div>
                  )}

                  {/* ----------------- 4. FULL CLUE / FLO STYLE PERIOD & CYCLE TRACKER ----------------- */}
                  {activeSheetType === 'period' && (
                    <div className="space-y-5 pb-6">
                      {/* Clue Style Circular Cycle Dial Display */}
                      <div className="flex flex-col items-center justify-center p-6 rounded-3xl bg-gradient-to-b from-zinc-900 via-pink-950/30 to-zinc-900 border border-pink-500/30 relative">
                        {/* Circular Dial */}
                        <div className="relative size-44 rounded-full border-4 border-zinc-800 flex items-center justify-center">
                          {/* Period Arc Indicator */}
                          <div className="absolute inset-0 rounded-full border-4 border-pink-500 border-t-transparent border-r-transparent rotate-45" />

                          {/* Center Info */}
                          <div className="text-center space-y-1">
                            <span className="inline-block px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 text-[10px] font-bold">
                              Day {formState.currentCycleDay} of {formState.cycleLength}
                            </span>
                            <h3 className="text-lg font-extrabold text-white">
                              {formState.periodDays - formState.currentCycleDay + 1 > 0
                                ? `${formState.periodDays - formState.currentCycleDay + 1} more days of period`
                                : 'Fertile Window Forecast'}
                            </h3>
                            <p className="text-[10px] text-zinc-400">
                              Next cycle in ~{formState.cycleLength - formState.currentCycleDay}{' '}
                              days
                            </p>
                          </div>
                        </div>

                        {/* Cycle Phase Legend */}
                        <div className="flex items-center gap-3 mt-4 text-[10px] text-zinc-400">
                          <span className="flex items-center gap-1">
                            <span className="size-2 rounded-full bg-pink-500" /> Period
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="size-2 rounded-full bg-cyan-400" /> Fertile
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="size-2 rounded-full bg-amber-400" /> Ovulation
                          </span>
                        </div>
                      </div>

                      {/* Flow Intensity Selector */}
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-pink-300">Flow Intensity</span>
                        <div className="grid grid-cols-4 gap-2">
                          {(
                            [
                              { key: 'spotting', label: 'Spotting', icon: '⚪' },
                              { key: 'light', label: 'Light', icon: '💧' },
                              { key: 'medium', label: 'Medium', icon: '💧💧' },
                              { key: 'heavy', label: 'Heavy', icon: '💧💧💧' },
                            ] as const
                          ).map((flow) => (
                            <button
                              key={flow.key}
                              type="button"
                              onClick={() =>
                                setFormState({ ...formState, flowIntensity: flow.key })
                              }
                              className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border transition-all ${
                                formState.flowIntensity === flow.key
                                  ? 'bg-pink-500/30 border-pink-400 text-white font-bold scale-105 shadow-lg'
                                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              <span className="text-sm">{flow.icon}</span>
                              <span className="text-[11px] mt-0.5">{flow.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Feelings & Moods Grid (Matching Reference Image 1) */}
                      <div className="space-y-2.5">
                        <span className="text-xs font-bold text-orange-400">
                          How do you feel today? (Daily Feelings)
                        </span>
                        <div className="grid grid-cols-3 gap-2">
                          {CLUE_MOODS.map((m) => {
                            const isSelected = formState.moods.includes(m.label);
                            return (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => toggleMood(m.label)}
                                className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border transition-all ${
                                  isSelected
                                    ? 'bg-orange-500/20 border-orange-400 text-orange-200 font-bold shadow'
                                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                                }`}
                              >
                                <span className="text-base">{m.icon}</span>
                                <span className="text-[10px] mt-1 text-center font-medium leading-tight">
                                  {m.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Physical Symptoms Multi-select */}
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-zinc-300">Physical Symptoms</span>
                        <div className="flex flex-wrap gap-1.5">
                          {PERIOD_SYMPTOMS.map((symptom) => {
                            const isSelected = formState.symptoms.includes(symptom);
                            return (
                              <button
                                key={symptom}
                                type="button"
                                onClick={() => toggleSymptom(symptom)}
                                className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all ${
                                  isSelected
                                    ? 'bg-pink-500/30 border-pink-400 text-pink-200 font-bold'
                                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                                }`}
                              >
                                {symptom}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Cycle Settings Sliders */}
                      <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-[11px]">
                        <div>
                          <label className="block text-zinc-400 mb-1">
                            Period Length ({formState.periodDays}d)
                          </label>
                          <input
                            type="range"
                            min="2"
                            max="8"
                            value={formState.periodDays}
                            onChange={(e) =>
                              setFormState({
                                ...formState,
                                periodDays: Number(e.target.value) || 5,
                              })
                            }
                            className="w-full accent-pink-500"
                          />
                        </div>
                        <div>
                          <label className="block text-zinc-400 mb-1">
                            Cycle Length ({formState.cycleLength}d)
                          </label>
                          <input
                            type="range"
                            min="21"
                            max="36"
                            value={formState.cycleLength}
                            onChange={(e) =>
                              setFormState({
                                ...formState,
                                cycleLength: Number(e.target.value) || 28,
                              })
                            }
                            className="w-full accent-pink-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Timezone Selector Modal */}
        <Modal
          isOpen={isTimezoneModalOpen}
          onClose={() => setIsTimezoneModalOpen(false)}
          title="Select Timezone"
        >
          <div className="space-y-1 text-xs max-h-72 overflow-y-auto">
            {TIMEZONES.map((tz) => (
              <button
                key={tz.value}
                type="button"
                onClick={() => {
                  setFormState({ ...formState, timezone: tz.value });
                  setIsTimezoneModalOpen(false);
                }}
                className={`w-full text-left p-2.5 rounded-xl transition-colors flex items-center justify-between ${
                  formState.timezone === tz.value
                    ? 'bg-[#3b82f6] text-white font-bold'
                    : 'text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                <span>{tz.label}</span>
                {formState.timezone === tz.value && <span>✓</span>}
              </button>
            ))}
          </div>
        </Modal>

        {/* Recurrence Selector Modal */}
        <Modal
          isOpen={isRecurrenceModalOpen}
          onClose={() => setIsRecurrenceModalOpen(false)}
          title="Repeat Option"
        >
          <div className="space-y-1 text-xs">
            {RECURRENCE_OPTIONS.map((rec) => (
              <button
                key={rec}
                type="button"
                onClick={() => {
                  setFormState({ ...formState, recurrence: rec });
                  setIsRecurrenceModalOpen(false);
                }}
                className={`w-full text-left p-2.5 rounded-xl transition-colors flex items-center justify-between ${
                  formState.recurrence === rec
                    ? 'bg-[#3b82f6] text-white font-bold'
                    : 'text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                <span>{rec}</span>
                {formState.recurrence === rec && <span>✓</span>}
              </button>
            ))}
          </div>
        </Modal>

        {/* Custom Notification Slider Modal */}
        <Modal
          isOpen={isNotificationSliderOpen}
          onClose={() => setIsNotificationSliderOpen(false)}
          title="Custom Notification Timing"
        >
          <div className="space-y-4 text-xs text-white">
            <div className="text-center py-2">
              <span className="text-lg font-bold text-[#3b82f6]">
                {NOTIFICATION_SLIDER_VALUES[notifSliderIndex].label}
              </span>
            </div>

            <input
              type="range"
              min="0"
              max={NOTIFICATION_SLIDER_VALUES.length - 1}
              value={notifSliderIndex}
              onChange={(e) => setNotifSliderIndex(Number(e.target.value))}
              className="w-full accent-[#3b82f6]"
            />

            <div className="flex items-center justify-between text-[10px] text-zinc-500">
              <span>5m</span>
              <span>1h</span>
              <span>1d</span>
              <span>1w</span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <Button variant="ghost" onClick={() => setIsNotificationSliderOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  addNotificationReminder(NOTIFICATION_SLIDER_VALUES[notifSliderIndex].label);
                  setIsNotificationSliderOpen(false);
                }}
              >
                Add Notification
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
                    ? 'All Day Entry'
                    : `${startOf(selectedEvent).toLocaleString()} – ${endOf(selectedEvent).toLocaleTimeString()}`}
                </span>
              </div>

              {selectedEvent.type && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md bg-[#3b82f6]/20 text-[#3b82f6]">
                    {selectedEvent.type}
                  </span>
                  {selectedEvent.flowIntensity && (
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-pink-500/20 text-pink-300 font-semibold">
                      Flow: {selectedEvent.flowIntensity}
                    </span>
                  )}
                </div>
              )}

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
                  Delete Entry
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
