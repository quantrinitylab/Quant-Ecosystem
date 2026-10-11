/**
 * Recurrence label <-> RFC 5545 RRULE conversion.
 *
 * `fromRRule` (RRULE -> label) is used by the event-detail page;
 * `toRecurrenceRule` (label -> RRULE) is used by the event form's save path,
 * because the backend rejects the human-readable labels. `buildCustomRRule`
 * backs the custom-interval builder. Recurrence expansion/exdate management
 * for writes lives server-side in
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
  // An interval other than 1 is a custom rule, not the plain preset —
  // "every 3 months" is not "Monthly".
  const intervalMatch = /INTERVAL=(\d+)/.exec(upper);
  if (intervalMatch && Number(intervalMatch[1]) !== 1) return 'Custom interval…';
  if (upper.includes('FREQ=DAILY')) return 'Daily';
  if (upper.includes('FREQ=WEEKLY')) return 'Weekly';
  if (upper.includes('FREQ=MONTHLY')) return 'Monthly';
  if (upper.includes('FREQ=YEARLY')) return 'Annually (Every year)';

  return 'Custom interval…';
}

/**
 * UI label (or a previously built RRULE) -> the `recurrence` the API accepts.
 *
 * The event form stores the human-readable label, but the backend only
 * accepts lowercase presets (`daily`, `weekly`, `monthly`, `yearly`,
 * `every weekday`) or a real `KEY=VALUE` RRULE. Sending the label verbatim
 * is why "Every weekday (Monday to Friday)", "Annually (Every year)" and
 * "Custom interval…" all failed to save with INVALID_RRULE.
 *
 * Already-built RRULEs (from the custom-interval builder) pass through
 * untouched. The bare "Custom interval…" label has no rule behind it — the
 * builder writes the RRULE directly, so reaching here means the builder
 * never ran; returning null drops recurrence rather than failing the save.
 */
export function toRecurrenceRule(label: string | null | undefined): string | null {
  switch (label) {
    case 'Daily':
      return 'FREQ=DAILY';
    case 'Weekly':
      return 'FREQ=WEEKLY';
    case 'Monthly':
      return 'FREQ=MONTHLY';
    case 'Every weekday (Monday to Friday)':
      return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
    case 'Annually (Every year)':
      return 'FREQ=YEARLY';
    case 'Custom interval…':
      return null;
    case 'Does not repeat':
    case null:
    case undefined:
      return null;
    default:
      // Already an RRULE (or RRULE:-prefixed) — pass through.
      return /^RRULE:|[A-Z]+=/.test(label) ? label : null;
  }
}

export type CustomIntervalUnit = 'day' | 'week' | 'month' | 'year';

/**
 * Build an RRULE from the custom-interval builder's "every N unit" input.
 * `INTERVAL` is omitted for 1 (the plain FREQ form is what `fromRRule`
 * recognizes back into the standard labels).
 */
export function buildCustomRRule(every: number, unit: CustomIntervalUnit): string {
  const n = Math.max(1, Math.min(99, Math.floor(every) || 1));
  const freq =
    unit === 'day' ? 'DAILY' : unit === 'week' ? 'WEEKLY' : unit === 'month' ? 'MONTHLY' : 'YEARLY';
  return n === 1 ? `FREQ=${freq}` : `FREQ=${freq};INTERVAL=${n}`;
}
