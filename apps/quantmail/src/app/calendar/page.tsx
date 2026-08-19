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
  flowIntensity?: 'light' | 'medium' | 'heavy' | 'super_heavy' | 'spotting';
  spottingColor?: 'red' | 'brown';
  collectionMethod?: string;
  symptoms?: string[];
  moods?: string[];
  pain?: string[];
  sleep?: string;
  sexLife?: string;
  energy?: string;
  intimateHealth?: string;
  hotFlashes?: string;
  bbt?: string;
  weight?: string;
  customTags?: string[];
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

// Clean SVGs for categories and items
function IconCalendar({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="3" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconClock({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconGlobe({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function IconRepeat({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function IconUsers({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconVideo({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function IconMapPin({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function IconBell({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function IconPaperclip({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function IconCake({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8" />
      <path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1" />
      <path d="M2 21h20" />
      <line x1="7" y1="8" x2="7" y2="11" />
      <line x1="12" y1="8" x2="12" y2="11" />
      <line x1="17" y1="8" x2="17" y2="11" />
      <line x1="7" y1="4" x2="7.01" y2="4" />
      <line x1="12" y1="4" x2="12.01" y2="4" />
      <line x1="17" y1="4" x2="17.01" y2="4" />
    </svg>
  );
}

function IconTarget({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function IconFlower({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 16.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 1 1 4.5 4.5 4.5 4.5 0 1 1-4.5 4.5" />
      <path d="M12 7.5V3" />
      <path d="M12 21v-4.5" />
      <path d="M16.5 12H21" />
      <path d="M3 12h4.5" />
    </svg>
  );
}

function IconDrop({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
    </svg>
  );
}

// Clue Reference Categories & Card Options
const CLUE_FEELINGS = [
  { id: 'mood_swings', label: 'Mood swings', symbol: '⛅' },
  { id: 'not_in_control', label: 'Not in control', symbol: '🌀' },
  { id: 'fine', label: 'Fine', symbol: '☁️' },
  { id: 'happy', label: 'Happy', symbol: '☀️' },
  { id: 'sad', label: 'Sad', symbol: '🌧️' },
  { id: 'sensitive', label: 'Sensitive', symbol: '💨' },
  { id: 'angry', label: 'Angry', symbol: '⚡' },
  { id: 'confident', label: 'Confident', symbol: '🌞' },
  { id: 'excited', label: 'Excited', symbol: '✨' },
  { id: 'irritable', label: 'Irritable', symbol: '🌩️' },
  { id: 'anxious', label: 'Anxious', symbol: '🌪️' },
  { id: 'insecure', label: 'Insecure', symbol: '🌧️' },
  { id: 'grateful', label: 'Grateful', symbol: '🌅' },
  { id: 'indifferent', label: 'Indifferent', symbol: '🌙' },
];

const CLUE_COLLECTION_METHODS = [
  { id: 'pad', label: 'Pad', icon: '🩸' },
  { id: 'tampon', label: 'Tampon', icon: '🧵' },
  { id: 'panty_liner', label: 'Panty liner', icon: '🩲' },
  { id: 'cup', label: 'Menstrual cup', icon: '🍷' },
];

const CLUE_PAIN = [
  { id: 'pain_free', label: 'Pain free', symbol: '😊' },
  { id: 'cramps', label: 'Cramps', symbol: '⚡' },
  { id: 'ovulation', label: 'Ovulation', symbol: '🥚' },
  { id: 'breast_tenderness', label: 'Breast tenderness', symbol: '🍈' },
  { id: 'headache', label: 'Headache', symbol: '🤕' },
  { id: 'backache', label: 'Backache', symbol: '💆' },
];

const CLUE_SLEEP = [
  { id: 'trouble_sleeping', label: 'Trouble falling asleep', symbol: '😴' },
  { id: 'refreshed', label: 'Woke up refreshed', symbol: '😄' },
  { id: 'tired', label: 'Woke up tired', symbol: '🥱' },
  { id: 'restless', label: 'Restless sleep', symbol: '🔄' },
];

const CLUE_SEX_LIFE = [
  { id: 'protected', label: 'Protected', symbol: '☂️' },
  { id: 'unprotected', label: 'Unprotected', symbol: '⛱️' },
  { id: 'withdrawal', label: 'Withdrawal', symbol: '💧' },
  { id: 'no_sex', label: 'No sex', symbol: '🚫' },
];

const CLUE_ENERGY = [
  { id: 'exhausted', label: 'Exhausted', symbol: '🏊' },
  { id: 'tired', label: 'Tired', symbol: '🧍' },
  { id: 'ok', label: 'OK', symbol: '🚶' },
  { id: 'energetic', label: 'Energetic', symbol: '🏃' },
];

const CLUE_INTIMATE = [
  { id: 'normal', label: 'Normal / Good', symbol: '🌸' },
  { id: 'dryness', label: 'Vaginal dryness', symbol: '💧' },
  { id: 'itchy', label: 'Itchy', symbol: '⚡' },
  { id: 'sore', label: 'Sore', symbol: '😣' },
];

const CLUE_HOT_FLASHES = [
  { id: 'none', label: 'None today', symbol: '🚫' },
  { id: 'mild', label: 'Mild', symbol: '🚀' },
  { id: 'moderate', label: 'Moderate', symbol: '🚀' },
  { id: 'severe', label: 'Severe', symbol: '🔥' },
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
  const [periodSubTab, setPeriodSubTab] = useState<'track' | 'cycle' | 'insights'>('track');
  const [isPeriodCustomizeOpen, setIsPeriodCustomizeOpen] = useState(false);

  const [selectedEvent, setSelectedEvent] = useState<CalendarEventLike | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Selector sheets / modals
  const [isTimezoneModalOpen, setIsTimezoneModalOpen] = useState(false);
  const [isRecurrenceModalOpen, setIsRecurrenceModalOpen] = useState(false);
  const [isNotificationSliderOpen, setIsNotificationSliderOpen] = useState(false);
  const [notifSliderIndex, setNotifSliderIndex] = useState(3);

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
    priority: 'low' | 'medium' | 'urgent';
    subtaskInput: string;
    subtasks: Array<{ text: string; done: boolean }>;
    birthYear: string;
    giftIdeas: string;
    flowIntensity: 'light' | 'medium' | 'heavy' | 'super_heavy' | 'spotting';
    spottingColor: 'red' | 'brown';
    collectionMethod: string;
    feelings: string[];
    pain: string[];
    pms: boolean;
    sleep: string;
    sexLife: string;
    energy: string;
    intimateHealth: string;
    hotFlashes: string;
    bbt: string;
    weight: string;
    customTagInput: string;
    customTags: string[];
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
    spottingColor: 'red',
    collectionMethod: 'Pad',
    feelings: ['Happy'],
    pain: ['Pain free'],
    pms: false,
    sleep: 'Woke up refreshed',
    sexLife: 'Protected',
    energy: 'Energetic',
    intimateHealth: 'Normal / Good',
    hotFlashes: 'None today',
    bbt: '',
    weight: '',
    customTagInput: '',
    customTags: [],
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
  const [sheetDragY, setSheetDragY] = useState(0);
  const [isSheetDragging, setIsSheetDragging] = useState(false);
  const sheetPointerRef = useRef<{ startY: number; time: number } | null>(null);

  const scrollHostRef = useRef<HTMLDivElement>(null);
  const dateItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const isProgrammaticScrollRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const activeMonthName = MONTH_NAMES[selectedDate.getMonth()];
  const activeYear = selectedDate.getFullYear();

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

  const holidaysByDay = useMemo(() => {
    const map: Record<string, Holiday[]> = {};
    for (const h of HOLIDAYS) {
      const parts = h.date.split('-');
      if (parts.length === 3) {
        const hd = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        const k = dayKey(hd);
        map[k] = [...(map[k] ?? []), h];
      }
    }
    return map;
  }, []);

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
      const k = dayKey(d);
      const isSelected = k === dayKey(selectedDate);
      const isToday = k === dayKey(today);
      const isCurrentSelectedMonth = d.getMonth() === selectedDate.getMonth();
      const hasHoliday = (holidaysByDay[k] ?? []).length > 0;
      const dayEvts = eventsByDay[k] ?? [];
      const hasPeriod = dayEvts.some((e) => e.type === 'period');
      const hasEvent = dayEvts.length > 0;

      return {
        date: d,
        dayNum: d.getDate(),
        dayLetter: WEEKDAYS_SHORT[i],
        isSelected,
        isToday,
        isCurrentMonth: isCurrentSelectedMonth,
        hasHoliday,
        hasPeriod,
        hasEvent,
        holidayName: (holidaysByDay[k] ?? [])[0]?.name,
        key: k,
      };
    });
  }, [selectedDate, today, holidaysByDay, eventsByDay]);

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
      hasPeriod: boolean;
      holidayName?: string;
    }> = [];

    for (let i = grid.offset - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, grid.prevMonthTotal - i);
      const k = dayKey(d);
      const hols = holidaysByDay[k] ?? [];
      const dayEvts = eventsByDay[k] ?? [];
      allDays.push({
        date: d,
        dayNum: d.getDate(),
        isCurrentMonth: false,
        isSelected: k === dayKey(selectedDate),
        isToday: k === dayKey(today),
        key: k,
        hasHolidays: hols.length > 0,
        hasEvents: dayEvts.length > 0,
        hasPeriod: dayEvts.some((e) => e.type === 'period'),
        holidayName: hols[0]?.name,
      });
    }

    for (let d = 1; d <= grid.total; d++) {
      const date = new Date(year, month, d);
      const k = dayKey(date);
      const hols = holidaysByDay[k] ?? [];
      const dayEvts = eventsByDay[k] ?? [];
      allDays.push({
        date,
        dayNum: d,
        isCurrentMonth: true,
        isSelected: k === dayKey(selectedDate),
        isToday: k === dayKey(today),
        key: k,
        hasHolidays: hols.length > 0,
        hasEvents: dayEvts.length > 0,
        hasPeriod: dayEvts.some((e) => e.type === 'period'),
        holidayName: hols[0]?.name,
      });
    }

    for (let d = 1; d <= grid.trailing; d++) {
      const date = new Date(year, month + 1, d);
      const k = dayKey(date);
      const hols = holidaysByDay[k] ?? [];
      const dayEvts = eventsByDay[k] ?? [];
      allDays.push({
        date,
        dayNum: d,
        isCurrentMonth: false,
        isSelected: k === dayKey(selectedDate),
        isToday: k === dayKey(today),
        key: k,
        hasHolidays: hols.length > 0,
        hasEvents: dayEvts.length > 0,
        hasPeriod: dayEvts.some((e) => e.type === 'period'),
        holidayName: hols[0]?.name,
      });
    }

    const weeks: (typeof allDays)[] = [];
    for (let i = 0; i < allDays.length; i += 7) {
      weeks.push(allDays.slice(i, i + 7));
    }
    return weeks;
  }, [grid, year, month, selectedDate, today, holidaysByDay, eventsByDay]);

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

  const COLLAPSED_HEIGHT = 104;
  const EXPANDED_HEIGHT = 336;

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
    if (deltaY > 0) {
      setSheetDragY(deltaY);
    }
  }, []);

  const handleSheetPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
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

    if (deltaY > 120 || velocityY > 0.4) {
      setActiveSheetType(null);
      return;
    }
  }, []);

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
        color:
          type === 'period'
            ? '#ec4899'
            : type === 'birthday'
              ? '#10b981'
              : type === 'task'
                ? '#f59e0b'
                : '#3b82f6',
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
        spottingColor: 'red',
        collectionMethod: 'Pad',
        feelings: ['Happy'],
        pain: ['Pain free'],
        pms: false,
        sleep: 'Woke up refreshed',
        sexLife: 'Protected',
        energy: 'Energetic',
        intimateHealth: 'Normal / Good',
        hotFlashes: 'None today',
        bbt: '',
        weight: '',
        customTagInput: '',
        customTags: [],
        periodDays: 5,
        cycleLength: 28,
        currentCycleDay: 1,
      });

      setIsFabOpen(false);
      setSheetDragY(0);
      setPeriodSubTab('track');
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
        finalTitle ||
        `🌸 Period Log (Day ${formState.currentCycleDay}, ${formState.flowIntensity} flow)`;
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
        (activeSheetType === 'period'
          ? `Feelings: ${formState.feelings.join(', ')} | Pain: ${formState.pain.join(', ')} | Energy: ${formState.energy}`
          : ''),
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
      spottingColor: activeSheetType === 'period' ? formState.spottingColor : undefined,
      collectionMethod: activeSheetType === 'period' ? formState.collectionMethod : undefined,
      moods: activeSheetType === 'period' ? formState.feelings : undefined,
      pain: activeSheetType === 'period' ? formState.pain : undefined,
      sleep: activeSheetType === 'period' ? formState.sleep : undefined,
      sexLife: activeSheetType === 'period' ? formState.sexLife : undefined,
      energy: activeSheetType === 'period' ? formState.energy : undefined,
      intimateHealth: activeSheetType === 'period' ? formState.intimateHealth : undefined,
      hotFlashes: activeSheetType === 'period' ? formState.hotFlashes : undefined,
      bbt: activeSheetType === 'period' ? formState.bbt : undefined,
      weight: activeSheetType === 'period' ? formState.weight : undefined,
      customTags: activeSheetType === 'period' ? formState.customTags : undefined,
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

  const toggleFeeling = (feelingLabel: string) => {
    setFormState((prev) => ({
      ...prev,
      feelings: prev.feelings.includes(feelingLabel)
        ? prev.feelings.filter((f) => f !== feelingLabel)
        : [...prev.feelings, feelingLabel],
    }));
  };

  const togglePain = (painLabel: string) => {
    setFormState((prev) => ({
      ...prev,
      pain: prev.pain.includes(painLabel)
        ? prev.pain.filter((p) => p !== painLabel)
        : [...prev.pain, painLabel],
    }));
  };

  const handleAddCustomTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && formState.customTagInput.trim()) {
      e.preventDefault();
      const tag = formState.customTagInput.trim().startsWith('#')
        ? formState.customTagInput.trim()
        : `#${formState.customTagInput.trim()}`;
      if (!formState.customTags.includes(tag)) {
        setFormState((prev) => ({
          ...prev,
          customTags: [...prev.customTags, tag],
          customTagInput: '',
        }));
      }
    }
  };

  const removeCustomTag = (tag: string) => {
    setFormState((prev) => ({
      ...prev,
      customTags: prev.customTags.filter((t) => t !== tag),
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
            className="flex items-center gap-1.5 text-base font-bold text-white hover:text-[#3b82f6] transition-colors"
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
            <IconCalendar className="size-4" />
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
            className="px-2.5 py-1 text-xs font-semibold rounded-md border border-zinc-700 bg-zinc-900 text-[#3b82f6] hover:bg-zinc-800 transition-colors shadow-sm"
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

        {/* Outlook-Style Interactive Expandable Date Picker with Pulsing Holiday & Event Indicators */}
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

            <div className="grid grid-cols-7 text-center py-1">
              {WEEKDAYS_SHORT.map((d, i) => (
                <div key={i} className="text-[11px] font-semibold text-zinc-400">
                  {d}
                </div>
              ))}
            </div>

            <div className="flex-1 overflow-hidden">
              {!isMonthExpanded ? (
                <div className="grid grid-cols-7 text-center h-[46px] items-center">
                  {currentWeekDays.map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => selectDate(d.date)}
                      className="flex flex-col items-center justify-center py-0.5 focus:outline-none relative group"
                    >
                      <span
                        className={`w-9 h-9 rounded-full flex flex-col items-center justify-center text-xs font-bold transition-all relative ${
                          d.isSelected
                            ? 'bg-[#3b82f6] text-white shadow-lg scale-105'
                            : d.isToday
                              ? 'border-2 border-[#3b82f6] text-[#3b82f6]'
                              : d.isCurrentMonth
                                ? 'text-zinc-200 hover:bg-zinc-800'
                                : 'text-zinc-500'
                        }`}
                      >
                        <span>{d.dayNum}</span>

                        {/* Holiday & Event Indicators / Pulsing Dot */}
                        {d.hasHoliday && !d.isSelected && (
                          <span
                            title={d.holidayName || 'Holiday'}
                            className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-emerald-400 ring-2 ring-[#161618] animate-pulse"
                          />
                        )}
                        {d.hasPeriod && !d.isSelected && (
                          <span
                            title="Period log"
                            className="absolute -bottom-0.5 size-1.5 rounded-full bg-rose-400"
                          />
                        )}
                        {!d.hasPeriod && d.hasEvent && !d.isSelected && !d.hasHoliday && (
                          <span className="absolute -bottom-0.5 size-1 rounded-full bg-[#3b82f6]" />
                        )}
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
                          className="flex flex-col items-center justify-center py-0.5 focus:outline-none relative"
                        >
                          <span
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all relative ${
                              d.isSelected
                                ? 'bg-[#3b82f6] text-white font-bold shadow-md scale-105'
                                : d.isToday
                                  ? 'border border-[#3b82f6] text-[#3b82f6]'
                                  : d.isCurrentMonth
                                    ? 'text-zinc-200 hover:bg-zinc-800'
                                    : 'text-zinc-600'
                            }`}
                          >
                            <span>{d.dayNum}</span>
                            {d.hasHolidays && !d.isSelected && (
                              <span
                                title={d.holidayName || 'Holiday'}
                                className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-emerald-400 ring-2 ring-[#161618] animate-pulse"
                              />
                            )}
                            {d.hasPeriod && !d.isSelected && (
                              <span className="absolute -bottom-0.5 size-1.5 rounded-full bg-rose-400" />
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

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

        {/* Continuous Agenda Feed */}
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

                    <div className="space-y-2">
                      {item.holidays.map((h, hi) => (
                        <div
                          key={hi}
                          className="flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-950/25 text-xs shadow-sm"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-base">🇮🇳</span>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-emerald-300">{h.name}</span>
                                <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                              </div>
                              {h.description && (
                                <p className="text-[10px] text-zinc-400">{h.description}</p>
                              )}
                            </div>
                          </div>
                          <span className="text-[9px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                            Holiday
                          </span>
                        </div>
                      ))}

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
                                  className="size-4 rounded border border-amber-500 hover:border-amber-400 mt-0.5 flex items-center justify-center text-[10px] text-transparent hover:text-white bg-amber-500/10"
                                >
                                  ✓
                                </button>
                              ) : isBirthday ? (
                                <IconCake className="size-4 text-emerald-400 mt-0.5 shrink-0" />
                              ) : isPeriod ? (
                                <IconFlower className="size-4 text-rose-400 mt-0.5 shrink-0" />
                              ) : (
                                <span className="size-2.5 rounded-full mt-1.5 shrink-0 bg-[#3b82f6]" />
                              )}

                              <div>
                                <div className="flex items-center gap-1.5">
                                  <h5 className="text-xs font-bold text-white">{ev.title}</h5>
                                  {isPeriod && ev.flowIntensity && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-rose-500/20 text-rose-300 font-semibold uppercase">
                                      {ev.flowIntensity}
                                    </span>
                                  )}
                                  {isBirthday && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-semibold">
                                      Birthday
                                    </span>
                                  )}
                                  {isTask && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-semibold">
                                      Task
                                    </span>
                                  )}
                                </div>

                                <p className="text-[11px] text-zinc-400 mt-0.5">
                                  {ev.allDay
                                    ? 'All Day'
                                    : `${hhmm(startOf(ev))} – ${hhmm(endOf(ev))}`}
                                  {ev.location ? ` · 📍 ${ev.location}` : ''}
                                  {ev.description ? ` · ${ev.description}` : ''}
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
                <button
                  type="button"
                  onClick={() => openDedicatedSheet('birthday')}
                  className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[#132d22] hover:bg-[#1a3d2e] text-emerald-300 text-xs font-bold shadow-xl border border-emerald-500/40 active:scale-95 transition-all"
                >
                  <IconCake className="size-4 text-emerald-400" />
                  <span>Birthday</span>
                </button>

                <button
                  type="button"
                  onClick={() => openDedicatedSheet('task')}
                  className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[#2b2210] hover:bg-[#3d3016] text-amber-300 text-xs font-bold shadow-xl border border-amber-500/40 active:scale-95 transition-all"
                >
                  <IconTarget className="size-4 text-amber-400" />
                  <span>Task</span>
                </button>

                <button
                  type="button"
                  onClick={() => openDedicatedSheet('period')}
                  className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-rose-950/95 hover:bg-rose-900 text-rose-200 text-xs font-bold shadow-xl border border-rose-500/50 active:scale-95 transition-all"
                >
                  <IconFlower className="size-4 text-rose-400" />
                  <span>Period Tracker</span>
                </button>

                <button
                  type="button"
                  onClick={() => openDedicatedSheet('event')}
                  className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[#172554] hover:bg-[#1e3a8a] text-blue-200 text-xs font-bold shadow-xl border border-blue-500/50 active:scale-95 transition-all"
                >
                  <IconCalendar className="size-4 text-blue-400" />
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

        {/* Dedicated Slide-up Sheets with Safe Top Inset to Prevent URL Bar Clipping */}
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
                animate={{ y: isSheetDragging ? Math.max(0, sheetDragY) : 0 }}
                exit={{ y: '100%' }}
                transition={
                  isSheetDragging
                    ? { duration: 0 }
                    : { type: 'spring', damping: 28, stiffness: 300 }
                }
                className="relative w-full max-w-lg bg-[#141416] border-t md:border border-zinc-800 rounded-t-3xl md:rounded-3xl shadow-2xl z-10 flex flex-col transition-all overflow-hidden h-[86vh] max-h-[86vh] mt-12 md:mt-0"
              >
                {/* Drag Handle & Sticky Top Header */}
                <div
                  onPointerDown={handleSheetPointerDown}
                  onPointerMove={handleSheetPointerMove}
                  onPointerUp={handleSheetPointerUp}
                  onPointerCancel={handleSheetPointerUp}
                  className="pt-3 pb-1 px-4 flex flex-col cursor-grab active:cursor-grabbing select-none touch-none bg-[#141416] border-b border-zinc-800/80 shrink-0"
                  style={{ touchAction: 'none' }}
                >
                  <div
                    className={`w-14 h-1.5 rounded-full mx-auto mb-2 transition-all ${
                      isSheetDragging ? 'bg-[#3b82f6] scale-110' : 'bg-zinc-600 hover:bg-zinc-400'
                    }`}
                  />

                  {/* Header Bar: ✕ on Left, Title in Center, Save on Right */}
                  <div className="flex items-center justify-between pb-1">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveSheetType(null)}
                        className="size-9 rounded-full hover:bg-zinc-800 text-zinc-300 hover:text-white flex items-center justify-center text-lg transition-colors"
                      >
                        ✕
                      </button>
                      <span className="text-sm font-bold text-white flex items-center gap-1.5">
                        {activeSheetType === 'event' && (
                          <span className="flex items-center gap-1.5 text-blue-300">
                            <IconCalendar className="size-4 text-blue-400" /> New Event
                          </span>
                        )}
                        {activeSheetType === 'task' && (
                          <span className="flex items-center gap-1.5 text-amber-300">
                            <IconTarget className="size-4 text-amber-400" /> New Task
                          </span>
                        )}
                        {activeSheetType === 'birthday' && (
                          <span className="flex items-center gap-1.5 text-emerald-300">
                            <IconCake className="size-4 text-emerald-400" /> New Birthday
                          </span>
                        )}
                        {activeSheetType === 'period' && (
                          <span className="flex items-center gap-1.5 text-rose-300">
                            <IconFlower className="size-4 text-rose-400" />
                            Today:{' '}
                            {new Date(formState.startDate).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                        )}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleSaveEntry()}
                      className={`px-5 py-1.5 rounded-full text-white font-bold text-xs shadow-md transition-all active:scale-95 ${
                        activeSheetType === 'period'
                          ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-900/50'
                          : activeSheetType === 'task'
                            ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-900/50'
                            : activeSheetType === 'birthday'
                              ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/50'
                              : 'bg-[#3b82f6] hover:bg-[#2563eb] shadow-blue-900/50'
                      }`}
                    >
                      Save
                    </button>
                  </div>

                  {/* Period Tracker Sub-tabs */}
                  {activeSheetType === 'period' && (
                    <div className="flex items-center justify-around pt-1 pb-1 text-xs">
                      {(
                        [
                          { key: 'track', label: 'Track', icon: '📝' },
                          { key: 'cycle', label: 'Cycle Dial', icon: '⭕' },
                          { key: 'insights', label: 'Insights', icon: '📊' },
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setPeriodSubTab(tab.key)}
                          className={`pb-1 px-3 font-semibold transition-colors border-b-2 flex items-center gap-1.5 ${
                            periodSubTab === tab.key
                              ? 'border-cyan-400 text-cyan-300 font-bold'
                              : 'border-transparent text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          <span>{tab.icon}</span>
                          <span>{tab.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Form Content Body */}
                <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4 text-xs text-white pb-24">
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

                      <div className="flex items-center justify-between py-2 border-b border-zinc-800/60">
                        <div className="flex items-center gap-2.5 text-zinc-300">
                          <IconClock className="size-4 text-blue-400" />
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

                      <button
                        type="button"
                        onClick={() => setIsTimezoneModalOpen(true)}
                        className="w-full flex items-center justify-between text-left text-zinc-300 hover:text-white py-2 border-b border-zinc-800/60"
                      >
                        <div className="flex items-center gap-2.5">
                          <IconGlobe className="size-4 text-cyan-400" />
                          <span>
                            {TIMEZONES.find((tz) => tz.value === formState.timezone)?.label ||
                              'India Standard Time (IST)'}
                          </span>
                        </div>
                        <span className="text-zinc-500 text-xs">›</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsRecurrenceModalOpen(true)}
                        className="w-full flex items-center justify-between text-left text-zinc-300 hover:text-white py-2 border-b border-zinc-800/60"
                      >
                        <div className="flex items-center gap-2.5">
                          <IconRepeat className="size-4 text-amber-400" />
                          <span>{formState.recurrence}</span>
                        </div>
                        <span className="text-zinc-500 text-xs">›</span>
                      </button>

                      <div className="py-2 border-b border-zinc-800/60 space-y-2">
                        <div className="flex items-center gap-2.5 text-zinc-300">
                          <IconUsers className="size-4 text-indigo-400" />
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

                      <div className="flex items-center justify-between py-2 border-b border-zinc-800/60">
                        <div className="flex items-center gap-2.5 text-zinc-300">
                          <IconVideo className="size-4 text-blue-400" />
                          <button
                            type="button"
                            onClick={handleAddMeetLink}
                            className="text-xs text-[#3b82f6] hover:underline font-semibold"
                          >
                            + Add QuantMeet / QuantChat video conferencing
                          </button>
                        </div>
                      </div>

                      <div className="py-2 border-b border-zinc-800/60 space-y-1.5">
                        <div className="flex items-center gap-2.5 text-zinc-300">
                          <IconMapPin className="size-4 text-rose-400" />
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

                      <div className="py-2 border-b border-zinc-800/60 space-y-2">
                        <div className="flex items-center justify-between text-zinc-300">
                          <div className="flex items-center gap-2.5">
                            <IconBell className="size-4 text-amber-400" />
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

                      <div className="py-2 space-y-1.5 text-zinc-300">
                        <div className="flex items-center gap-2.5">
                          <IconPaperclip className="size-4 text-zinc-400" />
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
                          className="w-full bg-transparent text-xl font-medium text-white placeholder-zinc-500 border-b border-zinc-700/80 pb-2 focus:outline-none focus:border-amber-500"
                          autoFocus
                        />
                      </div>

                      <div className="flex items-center justify-between py-2 border-b border-zinc-800/60">
                        <span className="text-zinc-400">Priority</span>
                        <div className="flex items-center gap-1.5">
                          {(
                            [
                              {
                                key: 'low',
                                label: 'Low',
                                color: 'text-emerald-400 border-emerald-500/40 bg-emerald-950/40',
                              },
                              {
                                key: 'medium',
                                label: 'Medium',
                                color: 'text-amber-400 border-amber-500/40 bg-amber-950/40',
                              },
                              {
                                key: 'urgent',
                                label: 'Urgent',
                                color: 'text-rose-400 border-rose-500/40 bg-rose-950/40',
                              },
                            ] as const
                          ).map((p) => (
                            <button
                              key={p.key}
                              type="button"
                              onClick={() => setFormState({ ...formState, priority: p.key })}
                              className={`px-3 py-1 rounded-xl text-[11px] font-bold border transition-all ${
                                formState.priority === p.key
                                  ? `${p.color} ring-1 ring-white/20 font-extrabold scale-105 shadow-md`
                                  : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                              }`}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-between py-2 border-b border-zinc-800/60">
                        <div className="flex items-center gap-2 text-zinc-300">
                          <IconCalendar className="size-4 text-amber-400" />
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
                          className="w-full bg-transparent text-xl font-medium text-white placeholder-zinc-500 border-b border-zinc-700/80 pb-2 focus:outline-none focus:border-emerald-500"
                          autoFocus
                        />
                      </div>

                      <div className="flex items-center justify-between py-2 border-b border-zinc-800/60">
                        <div className="flex items-center gap-2 text-zinc-300">
                          <IconCake className="size-4 text-emerald-400" />
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

                      <div className="flex items-center justify-between py-2 border-b border-zinc-800/60">
                        <div className="flex items-center gap-2 text-zinc-300">
                          <IconCalendar className="size-4 text-emerald-400" />
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

                  {/* ----------------- 4. COMPREHENSIVE CLUE / FLO PERIOD TRACKER ----------------- */}
                  {activeSheetType === 'period' && (
                    <div className="space-y-6">
                      {/* Sub-tab 1: DAILY TRACKING */}
                      {periodSubTab === 'track' && (
                        <div className="space-y-6">
                          {/* Mini Week Bar with Highlighted Period */}
                          <div className="p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-2">
                            <div className="flex items-center justify-between text-xs text-zinc-400">
                              <span>Cycle Dates</span>
                              <button
                                type="button"
                                onClick={() => setIsPeriodCustomizeOpen(true)}
                                className="px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-bold border border-cyan-500/30 hover:bg-cyan-500/30 transition-colors"
                              >
                                Customize ⇋
                              </button>
                            </div>
                            <div className="grid grid-cols-7 text-center gap-1">
                              {currentWeekDays.map((d) => (
                                <button
                                  key={d.key}
                                  type="button"
                                  onClick={() => {
                                    setFormState((prev) => ({
                                      ...prev,
                                      startDate: toDateInput(d.date),
                                      endDate: toDateInput(d.date),
                                    }));
                                  }}
                                  className={`py-1.5 rounded-lg flex flex-col items-center justify-center transition-all relative ${
                                    formState.startDate === d.key
                                      ? 'border-2 border-cyan-400 bg-rose-950/60 text-white font-bold scale-105 shadow-md'
                                      : 'bg-zinc-950 text-zinc-400 hover:bg-zinc-800'
                                  }`}
                                >
                                  <span className="text-[9px]">{d.dayLetter}</span>
                                  <span className="text-xs">{d.dayNum}</span>
                                  {d.hasHoliday && (
                                    <span className="absolute top-1 right-1 size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* 1. PERIOD FLOW */}
                          <div className="space-y-2">
                            <span className="text-xs font-bold text-white flex items-center gap-1.5">
                              <IconDrop className="size-3.5 text-rose-500" /> Period Flow
                            </span>
                            <div className="grid grid-cols-4 gap-2">
                              {(
                                [
                                  { key: 'light', label: 'Light', icon: '💧' },
                                  { key: 'medium', label: 'Medium', icon: '💧' },
                                  { key: 'heavy', label: 'Heavy', icon: '💧' },
                                  { key: 'super_heavy', label: 'Super', icon: '🩸' },
                                ] as const
                              ).map((flow) => (
                                <button
                                  key={flow.key}
                                  type="button"
                                  onClick={() =>
                                    setFormState({ ...formState, flowIntensity: flow.key })
                                  }
                                  className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${
                                    formState.flowIntensity === flow.key
                                      ? 'bg-rose-600 border-rose-400 text-white font-bold scale-105 shadow-lg shadow-rose-900/50'
                                      : 'bg-[#1e1e24] border-rose-500/20 text-rose-300 hover:bg-[#25252e]'
                                  }`}
                                >
                                  <span className="text-base">{flow.icon}</span>
                                  <span className="text-[11px] mt-1 font-semibold">
                                    {flow.label}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* 2. COLLECTION METHOD */}
                          <div className="space-y-2">
                            <span className="text-xs font-bold text-white flex items-center gap-1.5">
                              <span className="size-3.5 rounded-full bg-rose-500/30 flex items-center justify-center text-[10px]">
                                🛡️
                              </span>{' '}
                              Collection Method
                            </span>
                            <div className="grid grid-cols-4 gap-1.5">
                              {CLUE_COLLECTION_METHODS.map((cm) => (
                                <button
                                  key={cm.id}
                                  type="button"
                                  onClick={() =>
                                    setFormState({ ...formState, collectionMethod: cm.label })
                                  }
                                  className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border transition-all ${
                                    formState.collectionMethod === cm.label
                                      ? 'bg-rose-600/40 border-rose-400 text-white font-bold shadow'
                                      : 'bg-[#1e1e24] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                                  }`}
                                >
                                  <span className="text-base">{cm.icon}</span>
                                  <span className="text-[10px] mt-0.5 font-medium text-center leading-tight">
                                    {cm.label}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* 3. SPOTTING */}
                          <div className="space-y-2">
                            <span className="text-xs font-bold text-white flex items-center gap-1.5">
                              <IconFlower className="size-3.5 text-rose-400" /> Spotting
                            </span>
                            <div className="grid grid-cols-2 gap-2.5">
                              {(
                                [
                                  { key: 'red', label: 'Red Spotting', icon: '🔴' },
                                  { key: 'brown', label: 'Brown Spotting', icon: '🟤' },
                                ] as const
                              ).map((sp) => (
                                <button
                                  key={sp.key}
                                  type="button"
                                  onClick={() =>
                                    setFormState({ ...formState, spottingColor: sp.key })
                                  }
                                  className={`flex items-center justify-center gap-2 p-3 rounded-2xl border transition-all ${
                                    formState.spottingColor === sp.key
                                      ? 'bg-rose-600/30 border-rose-500 text-white font-bold shadow'
                                      : 'bg-[#1e1e24] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                                  }`}
                                >
                                  <span>{sp.icon}</span>
                                  <span className="text-[11px] font-semibold">{sp.label}</span>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* 4. FEELINGS / MOOD */}
                          <div className="space-y-2">
                            <span className="text-xs font-bold text-white flex items-center gap-1.5">
                              <span className="size-3.5 rounded-full bg-orange-500/30 flex items-center justify-center text-[10px]">
                                🧡
                              </span>{' '}
                              Feelings & Mood
                            </span>
                            <div className="grid grid-cols-3 gap-2">
                              {CLUE_FEELINGS.map((f) => {
                                const isSelected = formState.feelings.includes(f.label);
                                return (
                                  <button
                                    key={f.id}
                                    type="button"
                                    onClick={() => toggleFeeling(f.label)}
                                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${
                                      isSelected
                                        ? 'bg-orange-600/30 border-orange-500 text-orange-100 font-bold shadow'
                                        : 'bg-[#1e1e24] border-orange-500/20 text-orange-300 hover:bg-[#25252e]'
                                    }`}
                                  >
                                    <span className="text-lg">{f.symbol}</span>
                                    <span className="text-[10px] mt-1 text-center font-semibold leading-tight">
                                      {f.label}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* 5. PAIN & SYMPTOMS */}
                          <div className="space-y-2">
                            <span className="text-xs font-bold text-white flex items-center gap-1.5">
                              <span className="size-3.5 rounded-full bg-blue-500/30 flex items-center justify-center text-[10px]">
                                💙
                              </span>{' '}
                              Pain & Physical Symptoms
                            </span>
                            <div className="grid grid-cols-3 gap-2">
                              {CLUE_PAIN.map((p) => {
                                const isSelected = formState.pain.includes(p.label);
                                return (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => togglePain(p.label)}
                                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${
                                      isSelected
                                        ? 'bg-blue-600/30 border-blue-400 text-blue-100 font-bold shadow'
                                        : 'bg-[#1e1e24] border-blue-500/20 text-blue-300 hover:bg-[#25252e]'
                                    }`}
                                  >
                                    <span className="text-lg">{p.symbol}</span>
                                    <span className="text-[10px] mt-1 text-center font-semibold leading-tight">
                                      {p.label}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* 6. VULVA & INTIMATE HEALTH */}
                          <div className="space-y-2">
                            <span className="text-xs font-bold text-white flex items-center gap-1.5">
                              <span className="size-3.5 rounded-full bg-blue-500/30 flex items-center justify-center text-[10px]">
                                💧
                              </span>{' '}
                              Vulva & Vagina
                            </span>
                            <div className="grid grid-cols-4 gap-1.5">
                              {CLUE_INTIMATE.map((intm) => (
                                <button
                                  key={intm.id}
                                  type="button"
                                  onClick={() =>
                                    setFormState({ ...formState, intimateHealth: intm.label })
                                  }
                                  className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border transition-all ${
                                    formState.intimateHealth === intm.label
                                      ? 'bg-blue-600/30 border-blue-400 text-white font-bold shadow'
                                      : 'bg-[#1e1e24] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                                  }`}
                                >
                                  <span className="text-base">{intm.symbol}</span>
                                  <span className="text-[9px] mt-0.5 font-medium text-center leading-tight">
                                    {intm.label}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* 7. HOT FLASHES */}
                          <div className="space-y-2">
                            <span className="text-xs font-bold text-white flex items-center gap-1.5">
                              <span className="size-3.5 rounded-full bg-amber-500/30 flex items-center justify-center text-[10px]">
                                🔥
                              </span>{' '}
                              Hot Flashes
                            </span>
                            <div className="grid grid-cols-4 gap-1.5">
                              {CLUE_HOT_FLASHES.map((hf) => (
                                <button
                                  key={hf.id}
                                  type="button"
                                  onClick={() =>
                                    setFormState({ ...formState, hotFlashes: hf.label })
                                  }
                                  className={`flex flex-col items-center justify-center p-2 rounded-2xl border transition-all ${
                                    formState.hotFlashes === hf.label
                                      ? 'bg-amber-600/30 border-amber-400 text-white font-bold shadow'
                                      : 'bg-[#1e1e24] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                                  }`}
                                >
                                  <span className="text-base">{hf.symbol}</span>
                                  <span className="text-[10px] mt-0.5 font-medium">{hf.label}</span>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* 8. PMS TOGGLE */}
                          <div className="flex items-center justify-between p-3 rounded-2xl bg-[#1e1e24] border border-orange-500/20">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">☁️</span>
                              <span className="text-xs font-bold text-orange-300">
                                Premenstrual Syndrome (PMS)
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setFormState({ ...formState, pms: !formState.pms })}
                              className={`px-3 py-1 rounded-xl text-[11px] font-bold border transition-all ${
                                formState.pms
                                  ? 'bg-orange-500 text-white font-bold border-orange-400'
                                  : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                              }`}
                            >
                              {formState.pms ? 'Active' : 'Off'}
                            </button>
                          </div>

                          {/* 9. SLEEP QUALITY */}
                          <div className="space-y-2">
                            <span className="text-xs font-bold text-white flex items-center gap-1.5">
                              <span className="size-3.5 rounded-full bg-amber-500/30 flex items-center justify-center text-[10px]">
                                😴
                              </span>{' '}
                              Sleep Quality
                            </span>
                            <div className="grid grid-cols-2 gap-2">
                              {CLUE_SLEEP.map((sl) => (
                                <button
                                  key={sl.id}
                                  type="button"
                                  onClick={() => setFormState({ ...formState, sleep: sl.label })}
                                  className={`flex items-center gap-2 p-2.5 rounded-2xl border transition-all ${
                                    formState.sleep === sl.label
                                      ? 'bg-amber-600/30 border-amber-400 text-white font-bold shadow'
                                      : 'bg-[#1e1e24] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                                  }`}
                                >
                                  <span>{sl.symbol}</span>
                                  <span className="text-[10px] font-medium leading-tight">
                                    {sl.label}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* 10. SEX LIFE */}
                          <div className="space-y-2">
                            <span className="text-xs font-bold text-white flex items-center gap-1.5">
                              <span className="size-3.5 rounded-full bg-emerald-500/30 flex items-center justify-center text-[10px]">
                                💚
                              </span>{' '}
                              Sex Life & Protection
                            </span>
                            <div className="grid grid-cols-4 gap-1.5">
                              {CLUE_SEX_LIFE.map((sx) => (
                                <button
                                  key={sx.id}
                                  type="button"
                                  onClick={() => setFormState({ ...formState, sexLife: sx.label })}
                                  className={`flex flex-col items-center justify-center p-2 rounded-2xl border transition-all ${
                                    formState.sexLife === sx.label
                                      ? 'bg-emerald-600/30 border-emerald-400 text-emerald-200 font-bold shadow'
                                      : 'bg-[#1e1e24] border-emerald-500/20 text-emerald-300 hover:bg-[#25252e]'
                                  }`}
                                >
                                  <span className="text-base">{sx.symbol}</span>
                                  <span className="text-[9px] mt-0.5 font-semibold text-center leading-tight">
                                    {sx.label}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* 11. ENERGY LEVEL */}
                          <div className="space-y-2">
                            <span className="text-xs font-bold text-white flex items-center gap-1.5">
                              <span className="size-3.5 rounded-full bg-amber-500/30 flex items-center justify-center text-[10px]">
                                🏃
                              </span>{' '}
                              Energy Level
                            </span>
                            <div className="grid grid-cols-4 gap-1.5">
                              {CLUE_ENERGY.map((en) => (
                                <button
                                  key={en.id}
                                  type="button"
                                  onClick={() => setFormState({ ...formState, energy: en.label })}
                                  className={`flex flex-col items-center justify-center p-2 rounded-2xl border transition-all ${
                                    formState.energy === en.label
                                      ? 'bg-amber-600/30 border-amber-400 text-amber-200 font-bold shadow'
                                      : 'bg-[#1e1e24] border-amber-500/20 text-amber-300 hover:bg-[#25252e]'
                                  }`}
                                >
                                  <span className="text-base">{en.symbol}</span>
                                  <span className="text-[10px] mt-0.5 font-semibold text-center">
                                    {en.label}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* 12. BODY METRICS */}
                          <div className="grid grid-cols-2 gap-2.5 p-3 rounded-2xl bg-[#1e1e24] border border-zinc-800">
                            <div>
                              <span className="block text-[10px] text-zinc-400 mb-1">
                                🌡️ Basal Body Temp
                              </span>
                              <input
                                type="text"
                                placeholder="98.4 °F"
                                value={formState.bbt}
                                onChange={(e) =>
                                  setFormState({ ...formState, bbt: e.target.value })
                                }
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1 text-xs text-white"
                              />
                            </div>
                            <div>
                              <span className="block text-[10px] text-zinc-400 mb-1">
                                ⚖️ Weight
                              </span>
                              <input
                                type="text"
                                placeholder="58.5 kg"
                                value={formState.weight}
                                onChange={(e) =>
                                  setFormState({ ...formState, weight: e.target.value })
                                }
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-2.5 py-1 text-xs text-white"
                              />
                            </div>
                          </div>

                          {/* 13. MY CUSTOM TAGS */}
                          <div className="space-y-2">
                            <span className="text-xs font-bold text-zinc-300">My tags</span>
                            <input
                              type="text"
                              placeholder="+ Create new tag (press Enter)"
                              value={formState.customTagInput}
                              onChange={(e) =>
                                setFormState({ ...formState, customTagInput: e.target.value })
                              }
                              onKeyDown={handleAddCustomTag}
                              className="w-full bg-[#1e1e24] border border-zinc-800 rounded-2xl p-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none"
                            />
                            {formState.customTags.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {formState.customTags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-zinc-800 text-cyan-300 text-[10px] font-semibold border border-cyan-500/20"
                                  >
                                    <span>{tag}</span>
                                    <button
                                      type="button"
                                      onClick={() => removeCustomTag(tag)}
                                      className="text-zinc-400 hover:text-rose-400"
                                    >
                                      ✕
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* 14. DAILY NOTE */}
                          <div className="space-y-2">
                            <span className="text-xs font-bold text-zinc-300">Daily Note</span>
                            <textarea
                              rows={2}
                              placeholder="Any extra details to add today?…"
                              value={formState.description}
                              onChange={(e) =>
                                setFormState({ ...formState, description: e.target.value })
                              }
                              className="w-full bg-[#1e1e24] border border-zinc-800 rounded-2xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-rose-500 resize-none"
                            />
                          </div>
                        </div>
                      )}

                      {/* Sub-tab 2: CYCLE DIAL */}
                      {periodSubTab === 'cycle' && (
                        <div className="space-y-6">
                          <div className="flex flex-col items-center justify-center p-6 rounded-3xl bg-gradient-to-b from-zinc-900 via-rose-950/30 to-zinc-900 border border-rose-500/30">
                            <div className="relative size-48 rounded-full border-4 border-zinc-800 flex items-center justify-center">
                              <div className="absolute inset-0 rounded-full border-4 border-rose-500 border-t-transparent border-r-transparent rotate-45" />

                              <div className="text-center space-y-1">
                                <span className="inline-block px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-bold">
                                  Day {formState.currentCycleDay} of {formState.cycleLength}
                                </span>
                                <h3 className="text-xl font-extrabold text-white">
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

                            <div className="flex items-center gap-3 mt-4 text-[10px] text-zinc-400">
                              <span className="flex items-center gap-1">
                                <span className="size-2 rounded-full bg-rose-500" /> Period
                              </span>
                              <span className="flex items-center gap-1">
                                <span className="size-2 rounded-full bg-cyan-400" /> Fertile
                              </span>
                              <span className="flex items-center gap-1">
                                <span className="size-2 rounded-full bg-amber-400" /> Ovulation
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-[#1e1e24] border border-zinc-800 text-[11px]">
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
                                className="w-full accent-rose-500"
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
                                className="w-full accent-rose-500"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Sub-tab 3: INSIGHTS & GRAPHS */}
                      {periodSubTab === 'insights' && (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <span className="text-xs font-bold text-white">Cycle statistics</span>
                            <p className="text-[10px] text-zinc-400">
                              Averages are based on your cycle inputs.
                            </p>

                            <div className="grid grid-cols-2 gap-2">
                              <div className="p-3 rounded-2xl bg-[#1e1e24] border border-zinc-800 flex items-center justify-between">
                                <div>
                                  <span className="text-[10px] text-zinc-400">Cycle length</span>
                                  <h4 className="text-base font-extrabold text-cyan-400">
                                    {formState.cycleLength} days
                                  </h4>
                                </div>
                                <span className="text-base">⭕</span>
                              </div>

                              <div className="p-3 rounded-2xl bg-[#1e1e24] border border-zinc-800 flex items-center justify-between">
                                <div>
                                  <span className="text-[10px] text-zinc-400">Cycle variation</span>
                                  <h4 className="text-base font-extrabold text-zinc-300">±1 day</h4>
                                </div>
                                <span className="text-base">🔄</span>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 rounded-3xl bg-[#1e1e24] border border-zinc-800 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-white">Your cycle phase</span>
                              <span className="text-[10px] text-cyan-400 font-semibold">
                                Early follicular phase
                              </span>
                            </div>

                            <div className="h-14 w-full rounded-2xl bg-zinc-950 border border-zinc-800 overflow-hidden flex relative">
                              <div className="w-[45%] bg-rose-900/60 border-r border-rose-500/40 flex items-center justify-center text-[10px] text-rose-200 font-bold">
                                Follicular
                              </div>
                              <div className="w-[10%] bg-cyan-900/60 border-r border-cyan-400 flex items-center justify-center text-[10px] text-cyan-300 font-extrabold">
                                🔵
                              </div>
                              <div className="w-[45%] bg-emerald-900/60 flex items-center justify-center text-[10px] text-emerald-200 font-bold">
                                Luteal
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-zinc-400">
                              <span>Period (Day 1-{formState.periodDays})</span>
                              <span>Ovulation (~Day 14)</span>
                              <span>PMS (Day 24-28)</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Period Tracker Customize Settings Modal */}
        <Modal
          isOpen={isPeriodCustomizeOpen}
          onClose={() => setIsPeriodCustomizeOpen(false)}
          title="Customize Cycle Settings"
        >
          <div className="space-y-4 text-xs text-white">
            <div>
              <label className="block text-zinc-400 mb-1">
                Period Length ({formState.periodDays} days)
              </label>
              <input
                type="range"
                min="2"
                max="8"
                value={formState.periodDays}
                onChange={(e) =>
                  setFormState({ ...formState, periodDays: Number(e.target.value) || 5 })
                }
                className="w-full accent-rose-500"
              />
            </div>

            <div>
              <label className="block text-zinc-400 mb-1">
                Cycle Length ({formState.cycleLength} days)
              </label>
              <input
                type="range"
                min="21"
                max="36"
                value={formState.cycleLength}
                onChange={(e) =>
                  setFormState({ ...formState, cycleLength: Number(e.target.value) || 28 })
                }
                className="w-full accent-rose-500"
              />
            </div>

            <div>
              <label className="block text-zinc-400 mb-1">
                Current Cycle Day ({formState.currentCycleDay})
              </label>
              <input
                type="number"
                min="1"
                max={formState.cycleLength}
                value={formState.currentCycleDay}
                onChange={(e) =>
                  setFormState({ ...formState, currentCycleDay: Number(e.target.value) || 1 })
                }
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5 text-xs text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <Button variant="primary" onClick={() => setIsPeriodCustomizeOpen(false)}>
                Done
              </Button>
            </div>
          </div>
        </Modal>

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
                <IconClock className="size-4 text-blue-400" />
                <span>
                  {selectedEvent.allDay
                    ? 'All Day Entry'
                    : `${startOf(selectedEvent).toLocaleString()} – ${endOf(selectedEvent).toLocaleTimeString()}`}
                </span>
              </div>

              {selectedEvent.type && (
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md ${
                      selectedEvent.type === 'period'
                        ? 'bg-rose-500/20 text-rose-300'
                        : selectedEvent.type === 'task'
                          ? 'bg-amber-500/20 text-amber-300'
                          : selectedEvent.type === 'birthday'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-blue-500/20 text-blue-300'
                    }`}
                  >
                    {selectedEvent.type}
                  </span>
                  {selectedEvent.flowIntensity && (
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 font-semibold">
                      Flow: {selectedEvent.flowIntensity}
                    </span>
                  )}
                </div>
              )}

              {selectedEvent.location && (
                <div className="flex items-center gap-2">
                  <IconMapPin className="size-4 text-rose-400" />
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
