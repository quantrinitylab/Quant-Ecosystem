/**
 * RFC 5545 Recurrence Engine & Conversion Utilities
 *
 * Ensures single source of truth between frontend human recurrence selections
 * and backend RFC 5545 iCalendar standard RRULE strings.
 */

import type { CalendarEventLike } from '../types';

export type StandardRecurrenceLabel =
  | 'Does not repeat'
  | 'Daily'
  | 'Every weekday (Monday to Friday)'
  | 'Weekly'
  | 'Monthly'
  | 'Annually (Every year)'
  | 'Custom interval…';

export function toRRule(label: string): string | null {
  if (!label || label === 'Does not repeat') return null;
  if (label.startsWith('RRULE:')) return label.slice(6);
  if (label.includes('FREQ=')) return label;

  switch (label) {
    case 'Daily':
      return 'FREQ=DAILY';
    case 'Every weekday (Monday to Friday)':
      return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
    case 'Weekly':
      return 'FREQ=WEEKLY';
    case 'Monthly':
      return 'FREQ=MONTHLY';
    case 'Annually (Every year)':
      return 'FREQ=YEARLY';
    default:
      return null;
  }
}

export function fromRRule(rrule: string | null | undefined): StandardRecurrenceLabel {
  if (!rrule) return 'Does not repeat';
  const clean = rrule.startsWith('RRULE:') ? rrule.slice(6) : rrule;
  const upper = clean.toUpperCase();

  if (upper.includes('BYDAY=MO,TU,WE,TH,FR')) return 'Every weekday (Monday to Friday)';
  if (upper.includes('FREQ=DAILY')) return 'Daily';
  if (upper.includes('FREQ=WEEKLY')) return 'Weekly';
  if (upper.includes('FREQ=MONTHLY')) return 'Monthly';
  if (upper.includes('FREQ=YEARLY')) return 'Annually (Every year)';

  return 'Custom interval…';
}

export function formatRRuleDate(date: Date): string {
  if (Number.isNaN(date.getTime())) return '';
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

export function parseRRuleDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const clean = String(value).trim();
  if (clean.includes('-')) {
    const d = new Date(clean);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z)?$/i.exec(clean);
  if (match) {
    return new Date(
      Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4] ?? 0),
        Number(match[5] ?? 0),
        Number(match[6] ?? 0),
      ),
    );
  }
  return new Date(clean);
}

export function parseExdates(rruleStr?: string | null, exdates?: (Date | string)[]): string[] {
  const result = new Set<string>();
  if (exdates && Array.isArray(exdates)) {
    for (const ex of exdates) {
      const d = parseRRuleDate(ex);
      if (!Number.isNaN(d.getTime())) {
        result.add(d.toISOString().slice(0, 10));
        result.add(formatRRuleDate(d));
      }
    }
  }
  if (rruleStr && rruleStr.includes('EXDATE=')) {
    const match = /EXDATE=([^;]+)/i.exec(rruleStr);
    if (match) {
      for (const part of match[1]!.split(',')) {
        const d = parseRRuleDate(part.trim());
        if (!Number.isNaN(d.getTime())) {
          result.add(d.toISOString().slice(0, 10));
          result.add(formatRRuleDate(d));
        }
      }
    }
  }
  return Array.from(result);
}

/**
 * Checks whether an event occurs on a given day based on its start/end dates
 * and optional RFC 5545 recurrence rule. Respects EXDATE and UNTIL.
 */
export function isEventOnDate(
  eventStart: Date,
  eventEnd: Date,
  targetDate: Date,
  rruleStr?: string | null,
  exdates?: (Date | string)[],
): boolean {
  const targetDayStart = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate(),
    0,
    0,
    0,
  );
  const targetDayEnd = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate(),
    23,
    59,
    59,
    999,
  );

  // Direct date intersection check
  if (eventStart <= targetDayEnd && eventEnd >= targetDayStart) {
    const exclusions = parseExdates(rruleStr, exdates);
    const targetIsoDay = targetDate.toISOString().slice(0, 10);
    const targetRRuleDate = formatRRuleDate(targetDate);
    if (
      exclusions.some(
        (ex) => ex === targetIsoDay || ex === targetRRuleDate || ex.startsWith(targetIsoDay),
      )
    ) {
      return false;
    }
    return true;
  }

  // Recurrence rule evaluation
  if (!rruleStr || rruleStr === 'Does not repeat') {
    return false;
  }

  // If target date is before event start, recurrence hasn't started
  if (targetDayEnd < eventStart) {
    return false;
  }

  const rrule = toRRule(rruleStr);
  if (!rrule) return false;

  const upper = rrule.toUpperCase();

  // Check UNTIL boundary
  if (upper.includes('UNTIL=')) {
    const match = /UNTIL=([^;]+)/i.exec(upper);
    if (match) {
      const untilDate = parseRRuleDate(match[1]!);
      if (targetDayStart > untilDate) {
        return false;
      }
    }
  }

  // Check EXDATE exclusions
  const exclusions = parseExdates(rruleStr, exdates);
  const targetIsoDay = targetDate.toISOString().slice(0, 10);
  const targetRRuleDate = formatRRuleDate(targetDate);
  if (
    exclusions.some(
      (ex) => ex === targetIsoDay || ex === targetRRuleDate || ex.startsWith(targetIsoDay),
    )
  ) {
    return false;
  }

  if (upper.includes('FREQ=DAILY')) {
    return true;
  }

  if (upper.includes('FREQ=WEEKLY')) {
    if (upper.includes('BYDAY=MO,TU,WE,TH,FR')) {
      const day = targetDate.getDay();
      return day >= 1 && day <= 5;
    }
    return targetDate.getDay() === eventStart.getDay();
  }

  if (upper.includes('FREQ=MONTHLY')) {
    return targetDate.getDate() === eventStart.getDate();
  }

  if (upper.includes('FREQ=YEARLY')) {
    return (
      targetDate.getMonth() === eventStart.getMonth() &&
      targetDate.getDate() === eventStart.getDate()
    );
  }

  return false;
}

/**
 * Adds an EXDATE to a recurring event series, excluding a single occurrence without deleting other weeks.
 */
export function deleteOccurrence(
  event: CalendarEventLike,
  occurrenceDate: Date | string,
): CalendarEventLike {
  const occDate = parseRRuleDate(occurrenceDate);
  const formattedExDate = formatRRuleDate(occDate);
  const isoDate = occDate.toISOString().slice(0, 10);

  const existingExdates = event.exdates ? [...event.exdates] : [];
  if (!existingExdates.includes(formattedExDate) && !existingExdates.includes(isoDate)) {
    existingExdates.push(formattedExDate);
  }

  let recurrence = event.recurrence || 'Does not repeat';
  if (recurrence && recurrence !== 'Does not repeat') {
    let rrule = toRRule(recurrence) || recurrence;
    if (rrule.includes('EXDATE=')) {
      rrule = rrule.replace(/EXDATE=([^;]+)/i, (_, currentList) => {
        const parts = currentList.split(',').map((p: string) => p.trim());
        if (!parts.includes(formattedExDate)) {
          parts.push(formattedExDate);
        }
        return `EXDATE=${parts.join(',')}`;
      });
    } else {
      rrule = `${rrule};EXDATE=${formattedExDate}`;
    }
    recurrence = rrule;
  }

  return {
    ...event,
    recurrence,
    exdates: existingExdates,
  };
}

/**
 * Edits a single occurrence of a recurring series:
 * 1. Excludes the occurrenceDate from the parent event via EXDATE.
 * 2. Creates a detached single instance event with recurrenceParentId and originalStartTime.
 */
export function editOccurrence(
  event: CalendarEventLike,
  occurrenceDate: Date | string,
  patch: Partial<CalendarEventLike>,
): { updatedParent: CalendarEventLike; detachedInstance: CalendarEventLike } {
  const occDate = parseRRuleDate(occurrenceDate);
  const updatedParent = deleteOccurrence(event, occDate);

  const originalStart = occDate;
  const startD = patch.startTime
    ? patch.startTime instanceof Date
      ? patch.startTime
      : new Date(patch.startTime)
    : patch.start
      ? new Date(patch.start)
      : originalStart;

  const parentStart = new Date(event.startTime ?? event.start ?? originalStart);
  const parentEnd = new Date(event.endTime ?? event.end ?? originalStart);
  const duration = parentEnd.getTime() - parentStart.getTime();

  const endD = patch.endTime
    ? patch.endTime instanceof Date
      ? patch.endTime
      : new Date(patch.endTime)
    : patch.end
      ? new Date(patch.end)
      : new Date(startD.getTime() + (duration > 0 ? duration : 3600000));

  const detachedInstance: CalendarEventLike = {
    ...event,
    ...patch,
    id: `detached_${event.id}_${occDate.toISOString()}`,
    parentId: event.id,
    recurrenceParentId: event.id,
    originalStartTime: occDate,
    startTime: startD,
    endTime: endD,
    start: startD.toISOString(),
    end: endD.toISOString(),
    recurrence: 'Does not repeat',
    exdates: undefined,
  };

  return { updatedParent, detachedInstance };
}

/**
 * Truncates series at occurrenceDate with UNTIL and splits remaining occurrences into a new series.
 */
export function splitSeries(
  event: CalendarEventLike,
  occurrenceDate: Date | string,
  patch?: Partial<CalendarEventLike>,
): { updatedParent: CalendarEventLike; newSeries: CalendarEventLike } {
  const occDate = parseRRuleDate(occurrenceDate);
  const untilDate = new Date(occDate.getTime() - 1000);
  const untilFormatted = formatRRuleDate(untilDate);

  let parentRecurrence = event.recurrence || '';
  let parentRRule = toRRule(parentRecurrence) || parentRecurrence;
  if (parentRRule.includes('UNTIL=')) {
    parentRRule = parentRRule.replace(/UNTIL=[^;]+/i, `UNTIL=${untilFormatted}`);
  } else {
    parentRRule = `${parentRRule};UNTIL=${untilFormatted}`;
  }

  const updatedParent: CalendarEventLike = {
    ...event,
    recurrence: parentRRule,
  };

  const parentStart = new Date(event.startTime ?? event.start ?? occDate);
  const parentEnd = new Date(event.endTime ?? event.end ?? occDate);
  const duration = parentEnd.getTime() - parentStart.getTime();

  const newStart = patch?.startTime ? new Date(patch.startTime) : occDate;
  const newEnd = patch?.endTime
    ? new Date(patch.endTime)
    : new Date(newStart.getTime() + (duration > 0 ? duration : 3600000));

  const newSeries: CalendarEventLike = {
    ...event,
    ...patch,
    id: `series_${event.id}_${occDate.toISOString()}`,
    startTime: newStart,
    endTime: newEnd,
    start: newStart.toISOString(),
    end: newEnd.toISOString(),
    recurrence: patch?.recurrence ?? event.recurrence,
    exdates: event.exdates?.filter((ex) => parseRRuleDate(ex) >= occDate),
  };

  return { updatedParent, newSeries };
}

/**
 * Client-side occurrence generator that expands recurring events while strictly omitting any dates in EXDATE.
 */
export function expandOccurrencesClient(
  event: CalendarEventLike,
  startRange: Date,
  endRange: Date,
  maxOccurrences = 500,
): CalendarEventLike[] {
  if (!event.recurrence || event.recurrence === 'Does not repeat') {
    return [event];
  }

  const rrule = toRRule(event.recurrence) || event.recurrence;
  const upper = rrule.toUpperCase();
  const eventStart = new Date(event.startTime ?? event.start ?? '');
  const eventEnd = new Date(event.endTime ?? event.end ?? '');
  const duration = Math.max(0, eventEnd.getTime() - eventStart.getTime());

  const exclusions = parseExdates(event.recurrence, event.exdates);
  const isExcluded = (d: Date) => {
    const dayIso = d.toISOString().slice(0, 10);
    const rruleD = formatRRuleDate(d);
    return exclusions.some((ex) => ex === dayIso || ex === rruleD || ex.startsWith(dayIso));
  };

  let untilDate: Date | null = null;
  if (upper.includes('UNTIL=')) {
    const match = /UNTIL=([^;]+)/i.exec(upper);
    if (match) untilDate = parseRRuleDate(match[1]!);
  }

  const occurrences: CalendarEventLike[] = [];
  const current = new Date(eventStart);

  while (current <= endRange && occurrences.length < maxOccurrences) {
    if (untilDate && current > untilDate) break;

    const occurrenceEnd = new Date(current.getTime() + duration);
    if (current <= endRange && occurrenceEnd >= startRange) {
      if (!isExcluded(current)) {
        occurrences.push({
          ...event,
          parentId: event.parentId ?? event.id,
          recurrenceParentId: event.recurrenceParentId ?? event.parentId ?? event.id,
          id: `${event.id}_${current.toISOString()}`,
          startTime: new Date(current),
          endTime: occurrenceEnd,
          start: current.toISOString(),
          end: occurrenceEnd.toISOString(),
        });
      }
    }

    // Advance date according to frequency
    if (upper.includes('FREQ=DAILY')) {
      current.setDate(current.getDate() + 1);
    } else if (upper.includes('FREQ=WEEKLY')) {
      if (upper.includes('BYDAY=MO,TU,WE,TH,FR')) {
        current.setDate(current.getDate() + 1);
        while (current.getDay() === 0 || current.getDay() === 6) {
          current.setDate(current.getDate() + 1);
        }
      } else {
        current.setDate(current.getDate() + 7);
      }
    } else if (upper.includes('FREQ=MONTHLY')) {
      current.setMonth(current.getMonth() + 1);
    } else if (upper.includes('FREQ=YEARLY')) {
      current.setFullYear(current.getFullYear() + 1);
    } else {
      break;
    }
  }

  return occurrences;
}
