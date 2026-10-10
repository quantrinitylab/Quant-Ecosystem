/**
 * Recurrence label <-> RFC 5545 RRULE conversion.
 *
 * Only `fromRRule` survives here: it is used by the event-detail page.
 * The rest of the client-side recurrence engine (toRRule, formatRRuleDate,
 * parseRRuleDate, parseExdates, isEventOnDate, deleteOccurrence,
 * editOccurrence, splitSeries, expandOccurrencesClient) had zero callers
 * anywhere in src and no test coverage, so it was removed. Recurrence
 * expansion/exdate management for writes lives server-side in
 * apps/quantmail/backend/services/recurring.service.ts.
 */

export type StandardRecurrenceLabel =
  | 'Does not repeat'
  | 'Daily'
  | 'Every weekday (Monday to Friday)'
  | 'Weekly'
  | 'Monthly'
  | 'Annually (Every year)'
  | 'Custom interval…';

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
