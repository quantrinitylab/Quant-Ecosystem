import type { CalendarEventLike, EntryType } from '../types';
import { WEEKDAYS_SHORT } from '../types';
import type { Holiday } from '../../../lib/holidays';

export const startOf = (event: CalendarEventLike): Date =>
  new Date(event.startTime ?? event.start ?? '');

export const endOf = (event: CalendarEventLike): Date => new Date(event.endTime ?? event.end ?? '');

export const hhmm = (date: Date): string =>
  Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export const toDateInput = (date: Date): string =>
  `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;

export const toTimeInput = (date: Date): string =>
  `${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}`;

export const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;

export function parseCalendarEvent(raw: any): CalendarEventLike {
  let title: string = raw.title || '';
  let description: string = raw.description || '';
  let type: EntryType = 'event';
  let priority: 'low' | 'medium' | 'urgent' | undefined = undefined;
  let flowIntensity: 'light' | 'medium' | 'heavy' | 'super_heavy' | 'spotting' | undefined =
    undefined;
  let spottingColor: 'red' | 'brown' | undefined = undefined;
  let cycleDay: number | undefined = undefined;
  let subtasks: Array<{ text: string; done: boolean }> | undefined = undefined;
  let birthYear: string | undefined = undefined;
  let recurrenceParentId: string | undefined = raw.recurrenceParentId || raw.parentId;
  let originalStartTime: string | Date | undefined = raw.originalStartTime;
  let exdates: string[] | undefined = raw.exdates;
  const rawRrule: string = raw.recurrence || raw.recurrenceRule || '';
  if (!exdates && rawRrule.includes('EXDATE=')) {
    const m = /EXDATE=([^;]+)/i.exec(rawRrule);
    if (m) {
      exdates = m[1]!
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  // Extract structured metadata if present
  const metaMatch = description.match(/__QUANT_META__:([\s\S]*?):__END_QUANT_META__/);
  if (metaMatch) {
    try {
      const parsed = JSON.parse(metaMatch[1]);
      if (parsed.type) type = parsed.type;
      if (parsed.priority) priority = parsed.priority;
      if (parsed.flowIntensity) flowIntensity = parsed.flowIntensity;
      if (parsed.spottingColor) spottingColor = parsed.spottingColor;
      if (parsed.cycleDay) cycleDay = parsed.cycleDay;
      if (parsed.subtasks) subtasks = parsed.subtasks;
      if (parsed.birthYear) birthYear = parsed.birthYear;
      if (parsed.recurrenceParentId) recurrenceParentId = parsed.recurrenceParentId;
      if (parsed.originalStartTime) originalStartTime = parsed.originalStartTime;
      if (parsed.exdates) exdates = parsed.exdates;
      description = description.replace(/__QUANT_META__:[\s\S]*?:__END_QUANT_META__\n?/, '').trim();
    } catch {
      // ignore JSON parse failure
    }
  }

  // No metadata: do NOT infer the entry type from title substrings. The old
  // heuristics misclassified real titles ("Period-end close review" ->
  // 'period' with menstrual-health fields shown; "Audit committee meeting" ->
  // 'task'; any "task"/"todo" in a meeting title -> 'task'). Backend rows
  // carry their own explicit `type`; honor it below. Truly untyped imports
  // are plain events.
  const EXPLICIT_TYPES: ReadonlySet<string> = new Set(['event', 'task', 'birthday', 'period']);
  const explicitType =
    typeof raw.type === 'string' && EXPLICIT_TYPES.has(raw.type)
      ? (raw.type as EntryType)
      : undefined;

  return {
    ...raw,
    parentId: raw.parentId ?? recurrenceParentId,
    recurrenceParentId,
    originalStartTime,
    exdates,
    title,
    description,
    type: explicitType ?? type,
    priority,
    flowIntensity,
    spottingColor,
    cycleDay,
    subtasks,
    birthYear,
  };
}

export function calculateGrid(year: number, month: number) {
  const total = new Date(year, month + 1, 0).getDate();
  const offset = new Date(year, month, 1).getDay();
  const prevMonthTotal = new Date(year, month, 0).getDate();
  return { total, offset, prevMonthTotal, trailing: (7 - ((offset + total) % 7)) % 7 };
}

export function buildCurrentWeekDays(
  selectedDate: Date,
  today: Date,
  holidaysByDay: Record<string, Holiday[]>,
  eventsByDay: Record<string, CalendarEventLike[]>,
) {
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
    const hasTask = dayEvts.some((e) => e.type === 'task');
    const hasUrgentTask = dayEvts.some((e) => e.type === 'task' && e.priority === 'urgent');
    const hasBirthday = dayEvts.some((e) => e.type === 'birthday');
    const hasEvent = dayEvts.length > 0;
    const hasPlainEvent = dayEvts.some((e) => (e.type ?? 'event') === 'event');

    return {
      date: d,
      dayNum: d.getDate(),
      dayLetter: WEEKDAYS_SHORT[i],
      isSelected,
      isToday,
      isCurrentMonth: isCurrentSelectedMonth,
      hasHoliday,
      hasPeriod,
      hasTask,
      hasUrgentTask,
      hasBirthday,
      hasEvent,
      hasEvents: hasEvent,
      hasPlainEvent,
      holidayName: (holidaysByDay[k] ?? [])[0]?.name,
      key: k,
    };
  });
}

export function buildMonthWeeks(
  grid: { total: number; offset: number; prevMonthTotal: number; trailing: number },
  year: number,
  month: number,
  selectedDate: Date,
  today: Date,
  holidaysByDay: Record<string, Holiday[]>,
  eventsByDay: Record<string, CalendarEventLike[]>,
) {
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
    hasTask: boolean;
    hasUrgentTask: boolean;
    hasBirthday: boolean;
    hasPlainEvent: boolean;
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
      hasTask: dayEvts.some((e) => e.type === 'task'),
      hasUrgentTask: dayEvts.some((e) => e.type === 'task' && e.priority === 'urgent'),
      hasBirthday: dayEvts.some((e) => e.type === 'birthday'),
      hasPlainEvent: dayEvts.some((e) => (e.type ?? 'event') === 'event'),
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
      hasTask: dayEvts.some((e) => e.type === 'task'),
      hasUrgentTask: dayEvts.some((e) => e.type === 'task' && e.priority === 'urgent'),
      hasBirthday: dayEvts.some((e) => e.type === 'birthday'),
      hasPlainEvent: dayEvts.some((e) => (e.type ?? 'event') === 'event'),
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
      hasTask: dayEvts.some((e) => e.type === 'task'),
      hasUrgentTask: dayEvts.some((e) => e.type === 'task' && e.priority === 'urgent'),
      hasBirthday: dayEvts.some((e) => e.type === 'birthday'),
      hasPlainEvent: dayEvts.some((e) => (e.type ?? 'event') === 'event'),
      holidayName: hols[0]?.name,
    });
  }

  const weeks: (typeof allDays)[] = [];
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7));
  }
  return weeks;
}

/**
 * The prefetch window the calendar page asks GET /events for.
 *
 * The backend's window query rejects spans over 365 days (WINDOW_TOO_LARGE,
 * 400). The page used to ask for month-8 → month+10 (≈546 days), so the list
 * query failed on every load while the page swallowed the error — the
 * calendar rendered permanently empty and a freshly saved event (POST
 * succeeded, toast fired) never appeared in month/week/search.
 *
 * This band stays strictly inside the 365-day contract: 11 calendar months
 * (1st of month-5 → last day of month+5) can never exceed ~338 days, leaving
 * comfortable margin for leap years and long months.
 */
export const MAX_EVENT_QUERY_WINDOW_DAYS = 365;

export function defaultEventWindow(today: Date): { start: string; end: string } {
  const start = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  // day 0 of month+6 = last day of month+5
  const end = new Date(today.getFullYear(), today.getMonth() + 6, 0, 23, 59, 59);
  return { start: start.toISOString(), end: end.toISOString() };
}

const DAY_MS = 86_400_000;

/**
 * The agenda-aware prefetch window for GET /events.
 *
 * The infinite-scroll agenda extends its visible day range ±30 days per
 * edge-hit (`agendaRangeDays` on the calendar page). The page used to fetch
 * only the fixed defaultEventWindow() band, so once scrolling pushed past
 * the band edge, newly revealed days rendered silently EMPTY even though the
 * server had events there — a quiet data omission.
 *
 * This window is the UNION of the default band and the agenda range, so the
 * query key (['calendar-events', { start, end }]) changes as the user
 * scrolls and the hook refetches with `placeholderData: previousData`
 * keeping already-rendered days on screen. The union is clamped to
 * MAX_AGENDA_EVENT_WINDOW_DAYS (364) so it can never trip the backend's
 * 365-day WINDOW_TOO_LARGE 400 contract — when an extension would push past
 * the cap, `cappedPast`/`cappedFuture` report which side hit the wall so the
 * scroll handler stops extending there and the UI can say so honestly
 * instead of rendering empty days.
 */
export const MAX_AGENDA_EVENT_WINDOW_DAYS = 364;

export interface AgendaEventWindow {
  start: string;
  end: string;
  /** True when the past-side extension was trimmed to fit the 364-day cap. */
  cappedPast: boolean;
  /** True when the future-side extension was trimmed to fit the 364-day cap. */
  cappedFuture: boolean;
}

export function agendaEventWindow(
  today: Date,
  agendaRangeDays: { past: number; future: number },
): AgendaEventWindow {
  const band = defaultEventWindow(today);
  const bandStart = new Date(band.start).getTime();
  const bandEnd = new Date(band.end).getTime();

  // setDate arithmetic (not raw ms) so DST transitions can't drift the range.
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const agendaStartDate = new Date(dayStart);
  agendaStartDate.setDate(dayStart.getDate() - Math.max(0, agendaRangeDays.past));
  const agendaEndDate = new Date(dayStart);
  agendaEndDate.setDate(dayStart.getDate() + Math.max(0, agendaRangeDays.future));

  let start = Math.min(bandStart, agendaStartDate.getTime());
  let end = Math.max(bandEnd, agendaEndDate.getTime());
  let cappedPast = false;
  let cappedFuture = false;

  const maxSpanMs = MAX_AGENDA_EVENT_WINDOW_DAYS * DAY_MS;
  if (end - start > maxSpanMs) {
    // Trim only what sticks out past the default band — the band itself (and
    // with it `today`) always survives. Excess is shared proportionally
    // across the sides that overhang, so one-sided scrolling trims only the
    // side being extended.
    const overPast = Math.max(0, bandStart - start);
    const overFuture = Math.max(0, end - bandEnd);
    const totalOver = overPast + overFuture;
    const allowedOver = Math.max(0, maxSpanMs - (bandEnd - bandStart));
    const keepPast = totalOver > 0 ? (overPast / totalOver) * allowedOver : 0;
    const keepFuture = totalOver > 0 ? (overFuture / totalOver) * allowedOver : 0;
    start = bandStart - keepPast;
    end = bandEnd + keepFuture;
    // 1ms tolerance: ignore floating-point dust so "exactly at the cap"
    // does not read as capped.
    cappedPast = overPast > keepPast + 1;
    cappedFuture = overFuture > keepFuture + 1;
  }

  return {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    cappedPast,
    cappedFuture,
  };
}
