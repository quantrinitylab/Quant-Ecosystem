/**
 * RFC 5545 Recurrence Engine & Conversion Utilities
 *
 * Ensures single source of truth between frontend human recurrence selections
 * and backend RFC 5545 iCalendar standard RRULE strings.
 */

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

/**
 * Checks whether an event occurs on a given day based on its start/end dates
 * and optional RFC 5545 recurrence rule.
 */
export function isEventOnDate(
  eventStart: Date,
  eventEnd: Date,
  targetDate: Date,
  rruleStr?: string | null,
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
