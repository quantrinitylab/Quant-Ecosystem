'use client';

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useFocusTrap } from '@quant/shared-ui';
import { AppShell } from '../../components/AppShell';
import { AppSidebar } from '../../components/AppSidebar';
import {
  useCalendarEvents,
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
} from '../../hooks/useCalendar';
import { useAuth } from '../../providers/auth-provider';
import { useConfirm } from '../../hooks/useConfirm';
import { holidaysForMonth, type Holiday, HOLIDAYS } from '../../lib/holidays';
import { showToast } from '../../components/InboxToast';
import { useSearchParams } from 'next/navigation';
import type { CalendarEventLike, FormState, CalendarView, EntryType, CalendarContextTab } from './types';
import { FULL_WEEKDAYS, MONTHS_SHORT, MONTH_NAMES } from './types';
import {
  dayKey,
  toDateInput,
  toTimeInput,
  startOf,
  endOf,
  parseCalendarEvent,
  calculateGrid,
  buildCurrentWeekDays,
  buildMonthWeeks,
  agendaEventWindow,
} from './lib/calendar-geometry';
import { pointerStartsSheetDrag } from './lib/sheet-drag';
import {
  calendarEventMatchesQuery,
  calendarSearchStatus,
} from './lib/calendar-search';
import { toRecurrenceRule } from './lib/recurrence';
import { isEmailShaped, toAttendeeEmail } from './lib/attendee-validation';
import { guestNotificationToastText } from './lib/guest-notify';
import type { GuestNotificationStatus } from '../../types';
import { CalendarHeader } from './components/CalendarHeader';
import { CalendarEventForm } from './components/CalendarEventForm';
import { CalendarModals } from './components/CalendarModals';
import { BookingLinksModal } from './components/BookingLinksModal';
import type { WeekViewSheetOpts } from './components/CalendarWeekView';
import {
  CalendarContextSubTabs,
  mergedTabTargets,
  resolveMergedTab,
  type CalendarMergedTab,
} from './components/CalendarContextSubTabs';
import { CalendarMobileTabStrip } from './components/CalendarMobileTabStrip';
import { CalendarDayView } from './components/CalendarDayView';
import { calendarRouteForTab } from './lib/calendar-route';
import {
  CalendarFeedSubView,
  CalendarMonthSubView,
  CalendarWeekSubView,
  CalendarTrackersSubView,
  CalendarScheduleSubView,
} from '../../components/CalendarSubViews';

const createInitialFormState = (
  currentUserEmail: string = '',
  timezone: string = 'Asia/Kolkata',
): FormState => ({
  title: '',
  startDate: toDateInput(new Date()),
  endDate: toDateInput(new Date()),
  startTime: '10:00',
  endTime: '11:00',
  allDay: false,
  timezone,
  location: '',
  description: '',
  recurrence: 'Does not repeat',
  color: 'var(--app-accent)',
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

const isValidContextTab = (t: string | null): t is CalendarContextTab => {
  return (
    t === 'feed' ||
    t === 'month' ||
    t === 'events' ||
    t === 'schedule' ||
    t === 'agenda' ||
    t === 'booking' ||
    t === 'quantmeet' ||
    t === 'reminders'
  );
};

function initialCalendarRoute() {
  if (typeof window === 'undefined') return calendarRouteForTab(null);
  return calendarRouteForTab(new URLSearchParams(window.location.search).get('tab'));
}

function CalendarPageContent() {
  const today = useMemo(() => new Date(), []);
  const { user } = useAuth();
  const currentUserEmail = user?.email || '';

  const searchParams = useSearchParams();
  const queryTab = searchParams?.get('tab');

  // fix/qm-calendar-event-guest-notify: the event-detail page lands here
  // after a delete with ?guestNotice=<reason>[:<count>] so the honest guest
  // notification outcome is surfaced once instead of being lost in the
  // navigation. The param is scrubbed immediately after reading.
  useEffect(() => {
    const raw = searchParams?.get('guestNotice');
    if (!raw) return;
    const [reason, countRaw] = raw.split(':');
    const count = Number(countRaw);
    const status: GuestNotificationStatus = {
      notified: reason === 'sent',
      count: Number.isFinite(count) ? count : 0,
      reason: reason as GuestNotificationStatus['reason'],
    };
    const note = guestNotificationToastText(status, 'cancellation');
    if (note) {
      showToast({ text: note, type: status.notified ? 'success' : 'error' });
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('guestNotice');
    window.history.replaceState(null, '', url.toString());
  }, []);

  const [activeContextTab, setActiveContextTab] = useState<CalendarContextTab>(
    () => initialCalendarRoute().contextTab,
  );

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [activeView, setActiveView] = useState<CalendarView>(() => initialCalendarRoute().view);
  const [isMonthExpanded, setIsMonthExpanded] = useState(() => initialCalendarRoute().view === 'month');

  // Synchronize with URL searchParams changes (?tab=...). A bare /calendar
  // (pillar switcher, deep link without a tab) lands on the Day view.
  useEffect(() => {
    const route = calendarRouteForTab(queryTab);
    setActiveContextTab(route.contextTab);
    if (route.view === 'month') setIsMonthExpanded(true);
    if (route.contextTab === 'feed' || route.contextTab === 'agenda' || route.view === 'month') {
      setActiveView(route.view);
    }
  }, [queryTab]);

  // Synchronize with quant:subtab-change custom event dispatched by the shell's MobileSubTabStrip
  useEffect(() => {
    const handleSubtabChange = (e: Event) => {
      const custom = e as CustomEvent<{ pillar: string; tabId: string }>;
      if (custom.detail?.pillar !== 'calendar') return;
      if (custom.detail.tabId === 'week') {
        // Merged Week tab from the bottom nav: agenda context + week grid view.
        setActiveContextTab('agenda');
        setActiveView('week');
        return;
      }
      if (custom.detail.tabId === 'day') {
        // Day tab from the bottom nav: agenda context + single-day view.
        setActiveContextTab('agenda');
        setActiveView('day');
        return;
      }
      if (isValidContextTab(custom.detail.tabId)) {
        setActiveContextTab(custom.detail.tabId);
        if (custom.detail.tabId === 'month') {
          setIsMonthExpanded(true);
          setActiveView('month');
        } else if (custom.detail.tabId === 'feed' || custom.detail.tabId === 'agenda') {
          setActiveView('agenda');
        }
      }
    };
    window.addEventListener('quant:subtab-change', handleSubtabChange);
    return () => window.removeEventListener('quant:subtab-change', handleSubtabChange);
  }, []);

  const handleSelectContextTab = useCallback(
    (nextTab: CalendarContextTab) => {
      setActiveContextTab(nextTab);
      if (nextTab === 'month') {
        setIsMonthExpanded(true);
        setActiveView('month');
      } else if (nextTab === 'feed' || nextTab === 'agenda') {
        setActiveView('agenda');
      }

      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('tab', nextTab);
        window.history.pushState(null, '', url.toString());
        window.dispatchEvent(
          new CustomEvent('quant:subtab-change', {
            detail: {
              pillar: 'calendar',
              tabId: nextTab,
              queryParam: { key: 'tab', value: nextTab },
            },
          }),
        );
      }
    },
    [],
  );

  // Active Creation Sheet Type (Dedicated sheet per mode)
  const [activeSheetType, setActiveSheetType] = useState<EntryType | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Ref mirror of isSaving: guards against stale closures and React state
  // timing issues. A save in flight must never be re-entered, and the flag
  // must never get stuck — the ref is the source of truth for "busy".
  const isSavingRef = useRef(false);
  const [periodSubTab, setPeriodSubTab] = useState<'track' | 'cycle' | 'insights'>('track');
  const [isPeriodCustomizeOpen, setIsPeriodCustomizeOpen] = useState(false);

  const [selectedEvent, setSelectedEvent] = useState<CalendarEventLike | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [isQuantyDrawerOpen, setIsQuantyDrawerOpen] = useState(false);

  // Selector sheets / modals
  const [isTimezoneModalOpen, setIsTimezoneModalOpen] = useState(false);
  const [isRecurrenceModalOpen, setIsRecurrenceModalOpen] = useState(false);
  const [isNotificationSliderOpen, setIsNotificationSliderOpen] = useState(false);
  const [notifSliderIndex, setNotifSliderIndex] = useState(3);
  const [isBookingLinksOpen, setIsBookingLinksOpen] = useState(false);
  const [activeTimezone, setActiveTimezone] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('quant_calendar_timezone') || 'Asia/Kolkata';
    }
    return 'Asia/Kolkata';
  });

  const handleTimezoneChange = useCallback((tz: string) => {
    setActiveTimezone(tz);
    if (typeof window !== 'undefined') {
      localStorage.setItem('quant_calendar_timezone', tz);
    }
    setFormState((prev) => ({ ...prev, timezone: tz }));
  }, []);

  // Infinite agenda loading states & buffer
  const [isLoadingPast, setIsLoadingPast] = useState(false);
  const [isLoadingFuture, setIsLoadingFuture] = useState(false);
  const [agendaRangeDays, setAgendaRangeDays] = useState({ past: 14, future: 60 });

  // Rich Entry Form State
  const [formState, setFormState] = useState<FormState>(() =>
    createInitialFormState(currentUserEmail, activeTimezone),
  );

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
  const dateItemRefs = useRef<Map<string, HTMLElement>>(new Map());
  const isProgrammaticScrollRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasAnchoredTodayRef = useRef(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const activeMonthName = MONTH_NAMES[selectedDate.getMonth()];
  const activeYear = selectedDate.getFullYear();

  // Prefetch band for GET /events — must stay inside the backend's 365-day
  // window contract (PAUD-P0-5/QM-UIUX-078: the old month-8 → month+10 band
  // was ~546 days, so the list query 400'd on every load and the calendar
  // rendered empty even though saves succeeded).
  //
  // The band follows the infinite-scroll agenda range: as handleScroll
  // extends agendaRangeDays ±30 days per edge-hit, start/end change, the
  // ['calendar-events', options] query key changes, and the hook refetches —
  // so scrolled-in days never render empty while the server has events
  // (previously the fixed band silently omitted them). placeholderData:
  // previousData in the hook keeps already-rendered days on screen while
  // the wider window loads. The window is clamped to 364 days (never trips
  // the backend WINDOW_TOO_LARGE 400); when a side hits the cap, the
  // scroll handler stops extending there and the UI should say so
  // honestly instead of rendering empty days.
  const { start, end, cappedPast, cappedFuture } = useMemo(
    () => agendaEventWindow(today, agendaRangeDays),
    [today, agendaRangeDays],
  );

  const { data: rawEvents, isLoading, isFetching, error, refetch } = useCalendarEvents({ start, end });

  // Re-tap active app tab → refresh calendar events (P1: app-switcher refresh)
  useEffect(() => {
    const handleRefresh = () => {
      void refetch();
    };
    window.addEventListener('quant:refresh', handleRefresh);
    return () => window.removeEventListener('quant:refresh', handleRefresh);
  }, [refetch]);

  // Normalization with structured metadata parser
  const events = useMemo(() => {
    return ((rawEvents ?? []) as any[]).map(parseCalendarEvent);
  }, [rawEvents]);

  const isInitialLoading = isLoading && !rawEvents;

  // QM-SCREEN-026: Calendar search filters the events the server returned
  // (authorization-aware GET /events) — it makes no latency promise, and
  // its UX must distinguish loading / degraded (server load failed) /
  // updating / no-matches instead of rendering an empty list for all four.
  const searchMatchCount = useMemo(() => {
    if (!searchFilter.trim()) return 0;
    return events.filter((ev) => calendarEventMatchesQuery(ev, searchFilter)).length;
  }, [events, searchFilter]);

  const searchStatus = useMemo(
    () =>
      calendarSearchStatus({
        query: searchFilter,
        isLoading: isInitialLoading,
        isFetching,
        error,
        matchCount: searchMatchCount,
      }),
    [searchFilter, isInitialLoading, isFetching, error, searchMatchCount],
  );

  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const { confirm, dialog } = useConfirm();

  const grid = useMemo(() => calculateGrid(year, month), [year, month]);

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

  const currentWeekDays = useMemo(
    () => buildCurrentWeekDays(selectedDate, today, holidaysByDay, eventsByDay),
    [selectedDate, today, holidaysByDay, eventsByDay],
  );

  const monthWeeks = useMemo(
    () => buildMonthWeeks(grid, year, month, selectedDate, today, holidaysByDay, eventsByDay),
    [grid, year, month, selectedDate, today, holidaysByDay, eventsByDay],
  );

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

  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const sync = () => setIsCoarsePointer(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const COLLAPSED_HEIGHT = isCoarsePointer ? 128 : 114;
  const EXPANDED_HEIGHT = isCoarsePointer ? 336 : 304;

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
      const newHeight = pointerStartRef.current.startHeight + deltaY;
      const clamped = Math.max(COLLAPSED_HEIGHT, Math.min(EXPANDED_HEIGHT, newHeight));
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
    // Never hijack a gesture that starts on an interactive control. The
    // pointerdown from the Save/Close buttons (and the period sub-tabs)
    // bubbles up into this header; capturing the pointer here would retarget
    // the click to this div per the Pointer Events spec, so the button's
    // onClick would never fire and Save would appear completely dead
    // (P0-3: no handler, no request, no toast). Leave the gesture alone so
    // the click reaches the control the user actually pressed.
    if (!pointerStartsSheetDrag(e.target)) return;
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
      setEditingEventId(null);
      return;
    }
  }, []);

  const assembleAgendaDays = useCallback(
    (dates: Date[]) => {
      const list: Array<{
        date: Date;
        key: string;
        dayNum: number;
        weekdayName: string;
        monthShort: string;
        monthBreak: string | null;
        isToday: boolean;
        isTomorrow: boolean;
        events: CalendarEventLike[];
        holidays: Holiday[];
      }> = [];

      const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const tomorrow = new Date(base);
      tomorrow.setDate(base.getDate() + 1);
      const needle = searchFilter.trim().toLowerCase();

      for (const d of dates) {
        const key = dayKey(d);
        const dayEvents = eventsByDay[key] ?? [];
        const dayHolidays = holidaysByDay[key] ?? [];

        if (
          needle &&
          !dayEvents.some((e) => calendarEventMatchesQuery(e, searchFilter)) &&
          !dayHolidays.some((h) => h.name.toLowerCase().includes(needle))
        ) {
          continue;
        }

        const previous = list[list.length - 1];
        const monthChanged =
          !previous ||
          previous.date.getMonth() !== d.getMonth() ||
          previous.date.getFullYear() !== d.getFullYear();

        list.push({
          date: d,
          key,
          dayNum: d.getDate(),
          weekdayName: FULL_WEEKDAYS[d.getDay()],
          monthShort: MONTHS_SHORT[d.getMonth()],
          monthBreak: monthChanged ? `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` : null,
          isToday: key === dayKey(today),
          isTomorrow: key === dayKey(tomorrow),
          events: dayEvents,
          holidays: dayHolidays,
        });
      }

      return list;
    },
    [today, eventsByDay, holidaysByDay, searchFilter],
  );

  const continuousAgendaDays = useMemo(() => {
    const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dates: Date[] = [];
    for (let i = -agendaRangeDays.past; i <= agendaRangeDays.future; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      dates.push(d);
    }
    return assembleAgendaDays(dates);
  }, [today, agendaRangeDays, assembleAgendaDays]);

  const visibleAgendaDays = useMemo(() => {
    if (activeView === 'agenda') return continuousAgendaDays;

    if (activeView === 'day') {
      const d = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
      );
      return assembleAgendaDays([d]);
    }

    if (activeView === 'week') {
      return assembleAgendaDays(currentWeekDays.map((d) => d.date));
    }

    const total = new Date(year, month + 1, 0).getDate();
    return assembleAgendaDays(
      Array.from({ length: total }, (_, i) => new Date(year, month, i + 1)),
    );
  }, [
    activeView,
    continuousAgendaDays,
    assembleAgendaDays,
    currentWeekDays,
    selectedDate,
    year,
    month,
  ]);

  const selectView = useCallback((next: CalendarView) => {
    setActiveView(next);
    setIsMonthExpanded(next === 'month');
    if (next === 'agenda') hasAnchoredTodayRef.current = false;
  }, []);

  /*
   * The single merged tab row (CalendarContextSubTabs) owns view switching
   * now — the header's old Agenda/Week/Day/Month switcher is gone. Week/Day
   * keep the agenda sub-view and only reshape it; agenda/month go through the
   * normal context-tab path so the URL stays in sync.
   */
  const handleSelectMergedTab = useCallback(
    (tab: CalendarMergedTab) => {
      const targets = mergedTabTargets(tab);
      if (tab === 'week' || tab === 'day') {
        setActiveContextTab(targets.contextTab);
        selectView(targets.view);
        // P2: week/day used to skip the URL update that every other view does,
        // so ?tab= went stale (and back/refresh lost the view). ?tab=week and
        // ?tab=day are already understood by the sync effects above.
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          url.searchParams.set('tab', tab);
          window.history.pushState(null, '', url.toString());
          window.dispatchEvent(
            new CustomEvent('quant:subtab-change', {
              detail: {
                pillar: 'calendar',
                tabId: tab,
                queryParam: { key: 'tab', value: tab },
              },
            }),
          );
        }
        return;
      }
      handleSelectContextTab(targets.contextTab);
    },
    [handleSelectContextTab, selectView],
  );

  useEffect(() => {
    if (hasAnchoredTodayRef.current || isInitialLoading || activeView !== 'agenda') return;
    const host = scrollHostRef.current;
    const target = dateItemRefs.current.get(dayKey(today));
    if (!host || !target) return;

    hasAnchoredTodayRef.current = true;
    isProgrammaticScrollRef.current = true;
    host.scrollTop += target.getBoundingClientRect().top - host.getBoundingClientRect().top - 8;
    requestAnimationFrame(() => {
      isProgrammaticScrollRef.current = false;
    });
  }, [isInitialLoading, activeView, continuousAgendaDays, today]);

  const openDedicatedSheet = useCallback(
    // 3rd arg is a union: the month grid's drag-to-create passes the range
    // end date, the week view passes time opts. Disambiguated at runtime.
    (type: EntryType, date?: Date, rangeOrOpts?: Date | WeekViewSheetOpts) => {
      const base = date ? new Date(date) : new Date(selectedDate);
      const dateStr = toDateInput(base);
      const endDate = rangeOrOpts instanceof Date ? rangeOrOpts : undefined;
      const opts = rangeOrOpts instanceof Date ? undefined : rangeOrOpts;
      const endDateStr = endDate ? toDateInput(endDate) : dateStr;

      setFormState({
        title: '',
        startDate: dateStr,
        endDate: endDateStr,
        startTime: opts?.startTime ?? '10:00',
        endTime: opts?.endTime ?? '11:00',
        allDay: false,
        timezone: activeTimezone,
        location: '',
        description: '',
        recurrence: 'Does not repeat',
        color: 'var(--app-accent)',
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

      setSheetDragY(0);
      setPeriodSubTab('track');
      setEditingEventId(null);
      setActiveSheetType(type);
    },
    [selectedDate, currentUserEmail, activeTimezone],
  );

  const openEditSheet = useCallback((ev: CalendarEventLike) => {
    const type: EntryType =
      ev.type === 'task' || ev.type === 'birthday' || ev.type === 'period'
        ? (ev.type as EntryType)
        : 'event';
    const startD = startOf(ev);
    const endD = endOf(ev);
    const hasStart = !Number.isNaN(startD.getTime());
    const hasEnd = !Number.isNaN(endD.getTime());
    // Legacy rows may hold non-email strings ("hello" was storable before
    // attendee validation) — surface only email-shaped entries as chips so
    // they can never be re-saved or invited.
    const attendeeList = Array.isArray(ev.attendees)
      ? (ev.attendees as unknown[])
          .map((a) => toAttendeeEmail(a))
          .filter((a): a is string => a !== null)
      : [];
    const reminderList = Array.isArray(ev.reminders)
      ? (ev.reminders as unknown[])
          .map((r) => (typeof r === 'string' ? r : ((r as { label?: string })?.label ?? '')))
          .filter(Boolean)
      : [];

    setFormState((prev) => ({
      ...prev,
      title: ev.title || '',
      startDate: hasStart ? toDateInput(startD) : prev.startDate,
      endDate: hasEnd ? toDateInput(endD) : hasStart ? toDateInput(startD) : prev.endDate,
      startTime: hasStart && !ev.allDay ? toTimeInput(startD) : prev.startTime,
      endTime: hasEnd && !ev.allDay ? toTimeInput(endD) : prev.endTime,
      allDay: Boolean(ev.allDay),
      // Restore the event's saved timezone: the backend DTO carries it as
      // `timeZone` (camelCase); older rows may carry `timezone`. Without this
      // the sheet shows the form default and a save silently rewrites it.
      timezone: ev.timezone || ev.timeZone || prev.timezone,
      location: ev.location || '',
      description: ev.description || '',
      // The backend returns driveLink parsed from the stored __QUANT_META__
      // header; restore it so editing never silently drops the attached link.
      driveLink: ev.driveLink || '',
      recurrence: ev.recurrence || 'Does not repeat',
      color: ev.color || prev.color,
      attendeeInput: '',
      attendees: attendeeList,
      notifications: reminderList,
      priority: ev.priority || 'medium',
      subtaskInput: '',
      subtasks: ev.subtasks || [],
      // fix/qm-calendar-sheet-meta-roundtrip: these fields are stored in the
      // __QUANT_META__ header on save and now come back on the DTO; without
      // restoring them the form keeps stale/default values and a re-save
      // silently resets them (birthday year, period-log feelings/pain/energy).
      birthYear: typeof ev.birthYear === 'string' ? ev.birthYear : prev.birthYear,
      feelings: Array.isArray(ev.feelings) ? ev.feelings : prev.feelings,
      pain: Array.isArray(ev.pain) ? ev.pain : prev.pain,
      energy: typeof ev.energy === 'string' && ev.energy ? ev.energy : prev.energy,
      flowIntensity: ev.flowIntensity || 'medium',
      spottingColor: ev.spottingColor || 'red',
      currentCycleDay: ev.cycleDay || prev.currentCycleDay,
    }));

    setSelectedEvent(null);
    setSheetDragY(0);
    setPeriodSubTab('track');
    setEditingEventId(ev.id);
    setActiveSheetType(type);
  }, []);

  // The sheet must always be dismissible — even while a save is in flight.
  // A stalled network request must never trap the user in the dialog
  // (previously `if (isSaving) return` dead-ended the X button, the backdrop
  // click and Escape whenever a save hung).
  const closeSheet = useCallback(() => {
    setActiveSheetType(null);
    setEditingEventId(null);
  }, []);

  const sheetRef = useFocusTrap<HTMLDivElement>({ active: Boolean(activeSheetType) });

  useEffect(() => {
    if (!activeSheetType) return;
    const nestedOverlayOpen =
      isPeriodCustomizeOpen ||
      isTimezoneModalOpen ||
      isRecurrenceModalOpen ||
      isNotificationSliderOpen ||
      isBookingLinksOpen ||
      isQuantyDrawerOpen ||
      Boolean(selectedEvent);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || nestedOverlayOpen) return;
      closeSheet();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    activeSheetType,
    isPeriodCustomizeOpen,
    isTimezoneModalOpen,
    isRecurrenceModalOpen,
    isNotificationSliderOpen,
    isBookingLinksOpen,
    isQuantyDrawerOpen,
    selectedEvent,
    closeSheet,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const attendee = params.get('attendee');
    if (!attendee) return;
    openDedicatedSheet('event');
    // The query value is raw user input — never add it as a guest (or bake
    // it into the title) without an email-shape check.
    const email = attendee.trim();
    if (!isEmailShaped(email)) {
      showToast({ text: `"${attendee}" is not a valid email address — not added as a guest`, type: 'error' });
    } else {
      setFormState((prev) => ({
        ...prev,
        title: prev.title || `Meeting with ${email}`,
        attendees: prev.attendees.includes(email) ? prev.attendees : [...prev.attendees, email],
      }));
    }
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const handleSaveEntry = useCallback(async () => {
    if (!activeSheetType) return;
    // Belt-and-braces double-submit guard: the ref is the source of truth so
    // a stale closure can never re-enter a save already in flight.
    if (isSavingRef.current || isSaving) return;
    if (!formState.title.trim() && activeSheetType !== 'period') {
      // Never silently swallow a Save click — tell the user what is missing
      // and focus the title field so it can be fixed immediately.
      showToast({ text: 'Please add a title for your entry', type: 'error' });
      sheetRef.current
        ?.querySelector<HTMLInputElement>('[data-autofocus]')
        ?.focus();
      return;
    }

    let finalTitle = formState.title.trim();
    if (activeSheetType === 'period') {
      finalTitle =
        finalTitle ||
        `Period Log (Day ${formState.currentCycleDay}, ${formState.flowIntensity} flow)`;
    }

    // Parse + validate dates inside the guarded section: `new Date('T…')`
    // throws on empty/invalid input, and an unguarded throw used to reject
    // the promise silently (the click handler voids it) — Save appeared dead.
    let startIso: string;
    let endIso: string;
    try {
      if (formState.allDay) {
        startIso = new Date(`${formState.startDate}T00:00:00`).toISOString();
        endIso = new Date(`${formState.endDate || formState.startDate}T23:59:59`).toISOString();
      } else {
        startIso = new Date(`${formState.startDate}T${formState.startTime}:00`).toISOString();
        endIso = new Date(
          `${formState.endDate || formState.startDate}T${formState.endTime}:00`,
        ).toISOString();
      }
    } catch {
      showToast({ text: 'Please choose a valid date and time', type: 'error' });
      return;
    }

    // fix/qm-calendar-event-guest-notify — Gmail parity: editing an event with
    // guests asks "Send update to guests?" before the PUT. The backend only
    // emails when sendUpdate is true, so guests are never mailed silently.
    let sendUpdate = false;
    if (editingEventId && activeSheetType === 'event' && formState.attendees.length > 0) {
      sendUpdate = await confirm({
        title: 'Send update to guests?',
        message: `“${formState.title.trim() || 'Untitled event'}” has ${formState.attendees.length} guest${formState.attendees.length === 1 ? '' : 's'}. Send them an updated invitation by email?`,
        confirmLabel: 'Send update',
        cancelLabel: "Don't send",
      });
    }

    const metaObj = {
      type: activeSheetType,
      priority: activeSheetType === 'task' ? formState.priority : undefined,
      flowIntensity: activeSheetType === 'period' ? formState.flowIntensity : undefined,
      spottingColor: activeSheetType === 'period' ? formState.spottingColor : undefined,
      cycleDay: activeSheetType === 'period' ? formState.currentCycleDay : undefined,
      feelings: activeSheetType === 'period' ? formState.feelings : undefined,
      pain: activeSheetType === 'period' ? formState.pain : undefined,
      energy: activeSheetType === 'period' ? formState.energy : undefined,
      subtasks: activeSheetType === 'task' ? formState.subtasks : undefined,
      birthYear: activeSheetType === 'birthday' ? formState.birthYear : undefined,
      // Persisted by the backend into the __QUANT_META__ header; carried here
      // as well so the client-built description is self-consistent.
      driveLink: formState.driveLink.trim() || undefined,
    };
    const metaHeader = `__QUANT_META__:${JSON.stringify(metaObj)}:__END_QUANT_META__\n`;
    const userDesc =
      formState.description ||
      (activeSheetType === 'period'
        ? `Feelings: ${formState.feelings.join(', ')} | Pain: ${formState.pain.join(', ')} | Energy: ${formState.energy}`
        : '');
    const finalDescription = metaHeader + userDesc;

    const payload = {
      title: finalTitle,
      startTime: startIso,
      endTime: endIso,
      start: startIso,
      end: endIso,
      description: finalDescription,
      location: formState.location,
      allDay: formState.allDay,
      type: activeSheetType,
      color: formState.color,
      // The form holds the human-readable label (or a builder-made RRULE);
      // the API only accepts real RRULEs, so convert before sending.
      recurrence: toRecurrenceRule(formState.recurrence),
      reminders: formState.notifications,
      attendees: formState.attendees,
      accountEmail: formState.accountEmail,
      timezone: formState.timezone,
      // fix/qm-calendar-event-guest-notify: only true when the user confirmed
      // "Send update to guests?" above; the backend emails nobody otherwise.
      sendUpdate: editingEventId ? sendUpdate : undefined,
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

    isSavingRef.current = true;
    setIsSaving(true);
    // Never leave the save flag stuck on a hung request: race the mutation
    // against a timeout so the UI always recovers. The ref is cleared in a
    // `finally` so no exception path can leave the Save button dead.
    const SAVE_TIMEOUT_MS = 25000;
    try {
      const savePromise = editingEventId
        ? updateEvent.mutateAsync({ id: editingEventId, data: payload as never })
        : createEvent.mutateAsync(payload as never);
      // Swallow a late settlement after a timeout win — it is unobserved.
      savePromise.catch(() => undefined);
      const saved = (await Promise.race([
        savePromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('SAVE_TIMEOUT')), SAVE_TIMEOUT_MS),
        ),
      ])) as { guestNotification?: GuestNotificationStatus } | undefined;
      setTimeout(() => {
        isSavingRef.current = false;
        setIsSaving(false);
        setActiveSheetType(null);
        setEditingEventId(null);
        const entryLabel =
          activeSheetType === 'task'
            ? 'Task'
            : activeSheetType === 'birthday'
              ? 'Birthday'
              : activeSheetType === 'period'
                ? 'Cycle entry'
                : 'Event';
        showToast({
          text: `${entryLabel} "${finalTitle}" ${editingEventId ? 'updated' : 'saved'}`,
          type: 'success',
        });
        // fix/qm-calendar-event-guest-notify: report honestly whether the
        // guest update email actually went out — never fake the confirmation.
        const guestNote = guestNotificationToastText(saved?.guestNotification, 'update');
        if (guestNote) {
          showToast({
            text: guestNote,
            type: saved?.guestNotification?.notified ? 'success' : 'error',
          });
        }
        void refetch();
      }, 350);
    } catch (err) {
      isSavingRef.current = false;
      setIsSaving(false);
      // Log for debuggability — a save that fails must leave a trace.
      // eslint-disable-next-line no-console
      console.error('[calendar] save entry failed:', err);
      const timedOut = err instanceof Error && err.message === 'SAVE_TIMEOUT';
      showToast({
        text: timedOut
          ? 'Save is taking too long — check your connection and try again'
          : editingEventId
            ? 'Failed to update entry'
            : 'Failed to save entry',
        type: 'error',
      });
    } finally {
      // Absolute guarantee: the in-flight flag can never stick, even if a
      // future code path above throws outside the try/catch.
      isSavingRef.current = false;
    }
  }, [activeSheetType, formState, createEvent, updateEvent, editingEventId, refetch, isSaving]);

  const handleDeleteEvent = useCallback(
    async (id: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      // fix/qm-calendar-event-guest-notify: the delete confirm tells the
      // truth about what happens to guests now — a cancellation notice is
      // emailed, not silently skipped.
      const target = events.find((ev) => ev.id === id) ?? null;
      const guestCount = Array.isArray(target?.attendees) ? target.attendees.length : 0;
      const ok = await confirm({
        title: 'Delete this entry?',
        message:
          guestCount > 0
            ? `It is removed from your calendar. The ${guestCount} guest${guestCount === 1 ? '' : 's'} will be emailed a cancellation notice.`
            : 'It is removed from your calendar. Anyone you invited keeps their own copy unless you cancel it with them.',
        confirmLabel: 'Delete entry',
        variant: 'destructive',
      });
      if (ok) {
        try {
          const deleted = (await deleteEvent.mutateAsync(id)) as
            | { guestNotification?: GuestNotificationStatus }
            | undefined;
          setSelectedEvent(null);
          showToast({ text: 'Entry deleted', type: 'info' });
          // Honest reporting: never claim guests were notified unless the
          // backend actually sent the cancellation email.
          const guestNote = guestNotificationToastText(deleted?.guestNotification, 'cancellation');
          if (guestNote) {
            showToast({
              text: guestNote,
              type: deleted?.guestNotification?.notified ? 'success' : 'error',
            });
          }
          await refetch();
        } catch {
          showToast({ text: 'Failed to delete entry', type: 'error' });
        }
      }
    },
    [confirm, deleteEvent, events, refetch],
  );

  const addNotificationReminder = useCallback((timeText: string) => {
    setFormState((prev) => {
      if (!prev.notifications.includes(timeText)) {
        return {
          ...prev,
          notifications: [...prev.notifications, timeText],
        };
      }
      return prev;
    });
  }, []);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const host = e.currentTarget;
      const { scrollTop, scrollHeight, clientHeight } = host;

      if (activeView !== 'agenda') return;

      // Stop extending a side once the event window hits the 364-day backend
      // cap (cappedPast/cappedFuture): extending further would only render
      // empty days, since no wider window can be fetched. When this scroll
      // path is reattached to a live list, surface an honest end-of-range
      // note here instead of rendering more days.
      if (scrollHeight - scrollTop - clientHeight < 350 && !isLoadingFuture && !cappedFuture) {
        setIsLoadingFuture(true);
        setTimeout(() => {
          setAgendaRangeDays((prev) => ({ ...prev, future: prev.future + 30 }));
          setIsLoadingFuture(false);
        }, 250);
      }

      if (scrollTop < 120 && !isLoadingPast && !cappedPast) {
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
    [
      activeView,
      continuousAgendaDays,
      selectedDate,
      currentDate,
      isLoadingPast,
      isLoadingFuture,
      cappedPast,
      cappedFuture,
    ],
  );

  return (
    <AppShell
      sidebar={<AppSidebar />}
      theme="dark"
      className="quantmail-shell"
      searchValue={searchFilter}
      onSearchChange={setSearchFilter}
      searchPlaceholder="Search events, meetings, tasks, birthdays…"
      onQuantyOpenChange={setIsQuantyDrawerOpen}
    >
      <div className="flex flex-col h-full bg-[var(--quant-background)] text-white relative -mb-20">
        {/* -mb-20: extend the dark page background over the AppShell's pb-20
            bottom-nav reserve so no light-theme gap strip shows between the
            content and the fixed bottom nav. */}
        <CalendarHeader
          activeMonthName={activeMonthName}
          activeYear={activeYear}
          goMonth={goMonth}
          goToday={goToday}
          openDedicatedSheet={openDedicatedSheet}
          activeTimezone={activeTimezone}
          onChangeTimezone={handleTimezoneChange}
          onOpenBookingLinks={() => {
            handleSelectContextTab('booking');
            setIsBookingLinksOpen(true);
          }}
        />

        {/* Honest failure state (PAUD-P0-5/QM-UIUX-078): the events query
            error used to be swallowed, so a broken list contract rendered as
            a permanently empty calendar. Surface it with a retry. */}
        {error && !isInitialLoading && (
          <div
            role="alert"
            className="mx-3 mt-2 flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          >
            <span>Couldn't load your events — {(error as Error).message || 'please try again.'}</span>
            <button
              type="button"
              onClick={() => void refetch()}
              className="shrink-0 rounded-lg bg-red-500/20 px-3 py-1.5 font-semibold text-red-100 hover:bg-red-500/30 min-h-[44px]"
            >
              Retry
            </button>
          </div>
        )}

        {/* QM-SCREEN-026: honest search state. While a search is active the
            user must be able to tell loading / degraded (server load
            failed) / updating / no-matches apart — an empty list alone
            used to stand in for all of them. No latency is promised. */}
        {searchStatus.phase !== 'idle' && searchStatus.message && (
          <div
            role="status"
            aria-live="polite"
            data-testid="calendar-search-status"
            data-phase={searchStatus.phase}
            className="mx-3 mt-2 flex items-center justify-between gap-3 rounded-xl border border-[#232938] bg-[var(--quant-surface)] px-4 py-2.5 text-sm text-[var(--quant-muted-foreground)]"
          >
            <span>{searchStatus.message}</span>
            {searchStatus.phase === 'degraded' && (
              <button
                type="button"
                onClick={() => void refetch()}
                className="shrink-0 rounded-lg bg-[var(--quant-surface-elevated)] px-3 py-1.5 font-semibold text-white hover:bg-[#232938] min-h-[44px]"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/*
          The single merged tab row: Agenda/Week/Day/Month/Booking/QuantMeet/
          Reminders. Replaces the old double stack (header view switcher +
          context strip) that duplicated Agenda and Month.
        */}
        <CalendarContextSubTabs
          activeTab={resolveMergedTab(activeContextTab, activeView)}
          onSelectTab={handleSelectMergedTab}
        />

        {/* Mobile view switcher (AUD-P0-C2): the desktop tab row above is
            `hidden md:flex`, so without this strip the Month/Week/Trackers/
            Schedule views were unreachable on phones. Same wiring, md:hidden. */}
        <CalendarMobileTabStrip
          activeTab={resolveMergedTab(activeContextTab, activeView)}
          onSelectTab={handleSelectMergedTab}
        />

        {/* 4 Sovereign Contextual Sub-Views */}
        {(activeContextTab === 'feed' || activeContextTab === 'agenda') &&
        activeView === 'day' &&
        !searchFilter.trim() ? (
          // Real single-day view. An active search falls through to the feed
          // below, which lists matches across all loaded days with honest
          // loading / degraded / no-match states.
          <CalendarDayView
            events={events}
            holidaysByDay={holidaysByDay}
            selectedDate={selectedDate}
            onSelectDate={selectDate}
            openDedicatedSheet={openDedicatedSheet}
            onSelectEvent={setSelectedEvent}
            isLoading={isInitialLoading}
          />
        ) : (activeContextTab === 'feed' || activeContextTab === 'agenda') && activeView === 'week' ? (
          <CalendarWeekSubView
            events={events}
            holidaysByDay={holidaysByDay}
            selectedDate={selectedDate}
            onSelectDate={selectDate}
            openDedicatedSheet={openDedicatedSheet}
            onSelectEvent={setSelectedEvent}
          />
        ) : (
          (activeContextTab === 'feed' || activeContextTab === 'agenda') && (
            <CalendarFeedSubView
              events={events}
              holidaysByDay={holidaysByDay}
              selectedDate={selectedDate}
              onSelectDate={selectDate}
              openDedicatedSheet={openDedicatedSheet}
              onSelectEvent={setSelectedEvent}
              searchFilter={searchFilter}
              isSearchLoading={searchStatus.phase === 'loading'}
              searchError={
                searchStatus.phase === 'degraded' ? (searchStatus.message ?? undefined) : undefined
              }
              onSearchRetry={() => void refetch()}
            />
          )
        )}

        {activeContextTab === 'month' && (
          <CalendarMonthSubView
            events={events}
            holidaysByDay={holidaysByDay}
            selectedDate={selectedDate}
            onSelectDate={selectDate}
            openDedicatedSheet={openDedicatedSheet}
            onSelectEvent={setSelectedEvent}
            viewDate={currentDate}
            onPrevMonth={() => goMonth(-1)}
            onNextMonth={() => goMonth(1)}
            onGoToday={goToday}
          />
        )}

        {activeContextTab === 'events' && (
          <CalendarTrackersSubView
            events={events}
            openDedicatedSheet={openDedicatedSheet}
            onSelectEvent={setSelectedEvent}
            userId={user?.id ?? ''}
          />
        )}

        {(activeContextTab === 'schedule' ||
          activeContextTab === 'booking' ||
          activeContextTab === 'quantmeet' ||
          activeContextTab === 'reminders') && (
          <CalendarScheduleSubView
            events={events}
            selectedDate={selectedDate}
            openDedicatedSheet={openDedicatedSheet}
            onSelectEvent={setSelectedEvent}
          />
        )}

        <CalendarEventForm
          activeSheetType={activeSheetType}
          closeSheet={closeSheet}
          sheetRef={sheetRef}
          editingEventId={editingEventId}
          isSheetDragging={isSheetDragging}
          sheetDragY={sheetDragY}
          handleSheetPointerDown={handleSheetPointerDown}
          handleSheetPointerMove={handleSheetPointerMove}
          handleSheetPointerUp={handleSheetPointerUp}
          isSaving={isSaving}
          handleSaveEntry={handleSaveEntry}
          periodSubTab={periodSubTab}
          setPeriodSubTab={setPeriodSubTab}
          formState={formState}
          setFormState={setFormState}
          currentUserEmail={currentUserEmail}
          setIsTimezoneModalOpen={setIsTimezoneModalOpen}
          setIsRecurrenceModalOpen={setIsRecurrenceModalOpen}
          setIsNotificationSliderOpen={setIsNotificationSliderOpen}
          setIsPeriodCustomizeOpen={setIsPeriodCustomizeOpen}
          currentWeekDays={currentWeekDays}
        />

        <CalendarModals
          isPeriodCustomizeOpen={isPeriodCustomizeOpen}
          setIsPeriodCustomizeOpen={setIsPeriodCustomizeOpen}
          formState={formState}
          setFormState={setFormState}
          isTimezoneModalOpen={isTimezoneModalOpen}
          setIsTimezoneModalOpen={setIsTimezoneModalOpen}
          isRecurrenceModalOpen={isRecurrenceModalOpen}
          setIsRecurrenceModalOpen={setIsRecurrenceModalOpen}
          isNotificationSliderOpen={isNotificationSliderOpen}
          setIsNotificationSliderOpen={setIsNotificationSliderOpen}
          notifSliderIndex={notifSliderIndex}
          setNotifSliderIndex={setNotifSliderIndex}
          addNotificationReminder={addNotificationReminder}
          selectedEvent={selectedEvent}
          setSelectedEvent={setSelectedEvent}
          openEditSheet={openEditSheet}
          handleDeleteEvent={(id) => void handleDeleteEvent(id)}
        />

        <BookingLinksModal
          isOpen={isBookingLinksOpen}
          onClose={() => setIsBookingLinksOpen(false)}
          userEmail={currentUserEmail}
        />

        {dialog}
      </div>
    </AppShell>
  );
}

export default function CalendarPage() {
  return (
    <React.Suspense fallback={<div className="h-full w-full bg-[var(--quant-background)]" />}>
      <CalendarPageContent />
    </React.Suspense>
  );
}
