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
      description = description.replace(/__QUANT_META__:[\s\S]*?:__END_QUANT_META__\n?/, '').trim();
    } catch {
      // ignore JSON parse failure
    }
  }

  // Fallback heuristic inference if metadata wasn't present
  if (!metaMatch) {
    const tLow = title.toLowerCase();
    if (
      title.includes('🌸') ||
      tLow.includes('period') ||
      tLow.includes('cycle') ||
      tLow.includes('menstrual') ||
      tLow.includes('flow')
    ) {
      type = 'period';
      if (tLow.includes('super_heavy') || tLow.includes('super heavy') || tLow.includes('super')) {
        flowIntensity = 'super_heavy';
      } else if (tLow.includes('heavy')) {
        flowIntensity = 'heavy';
      } else if (tLow.includes('light')) {
        flowIntensity = 'light';
      } else {
        flowIntensity = 'medium';
      }
    } else if (
      title.includes('🎯') ||
      tLow.includes('task') ||
      tLow.includes('urgent') ||
      tLow.includes('todo') ||
      tLow.includes('audit')
    ) {
      type = 'task';
      if (tLow.includes('urgent')) priority = 'urgent';
      else if (tLow.includes('low')) priority = 'low';
      else priority = 'medium';
    } else if (title.includes('🎂') || tLow.includes('birthday') || tLow.includes('bday')) {
      type = 'birthday';
    }
  }

  return {
    ...raw,
    title,
    description,
    type,
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
