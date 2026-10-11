// ============================================================================
// find-a-time.ts — "Find a time" slot suggestion logic (QM calendar).
//
// Pure, testable core of the Find a time affordance: given the organizer's real
// busy blocks (from GET /events/free-busy) and a search window, it scans for
// open slots that fit the event's duration inside working hours. It never
// invents guest availability — guest busy data simply isn't shared with the
// organizer, so suggestions are always "free on YOUR calendar".
// ============================================================================

/** A busy block as returned by GET /events/free-busy (`data.busy`). */
export interface FreeBusyBlock {
  start: string;
  end: string;
}

/** A suggested open slot — real Dates in the browser's local timezone. */
export interface TimeSlot {
  start: Date;
  end: Date;
}

export interface SuggestSlotsOptions {
  /** Event length in milliseconds. Defaults to 30 minutes. */
  durationMs?: number;
  /** Working day start (local hour, 24h). Defaults to 9. */
  dayStartHour?: number;
  /** Working day end (local hour, 24h, exclusive bound for slot END). Defaults to 18. */
  dayEndHour?: number;
  /** Step between candidate starts, in minutes. Defaults to 30. */
  granularityMinutes?: number;
  /** Max slots returned. Defaults to 6. */
  maxSuggestions?: number;
}

const DEFAULT_DURATION_MS = 30 * 60 * 1000;

/**
 * Scan [windowStart, windowEnd) for open slots of `durationMs` inside working
 * hours that do not overlap any busy block. Days are calendar-local (browser
 * timezone); busy blocks are absolute instants, so the math stays consistent
 * wherever the organizer's timezone is.
 *
 * Never returns invented data: an empty busy list yields the full working-day
 * grid; malformed blocks are ignored (treated as absent, not guessed).
 */
export function suggestOpenSlots(
  busy: FreeBusyBlock[] | null | undefined,
  windowStart: Date,
  windowEnd: Date,
  options: SuggestSlotsOptions = {},
): TimeSlot[] {
  const {
    durationMs = DEFAULT_DURATION_MS,
    dayStartHour = 9,
    dayEndHour = 18,
    granularityMinutes = 30,
    maxSuggestions = 6,
  } = options;

  if (!(windowStart instanceof Date) || !(windowEnd instanceof Date)) return [];
  if (Number.isNaN(windowStart.getTime()) || Number.isNaN(windowEnd.getTime())) return [];
  if (windowEnd.getTime() <= windowStart.getTime()) return [];
  if (!Number.isFinite(durationMs) || durationMs <= 0) return [];
  if (!Number.isFinite(maxSuggestions) || maxSuggestions <= 0) return [];

  const stepMs = Math.max(5, granularityMinutes || 30) * 60 * 1000;

  // Normalize busy blocks to [startMs, endMs], dropping malformed ones.
  const blocks: Array<[number, number]> = [];
  for (const b of busy ?? []) {
    if (!b || typeof b.start !== 'string' || typeof b.end !== 'string') continue;
    const s = Date.parse(b.start);
    const e = Date.parse(b.end);
    if (Number.isNaN(s) || Number.isNaN(e) || e <= s) continue;
    blocks.push([s, e]);
  }
  blocks.sort((a, b) => a[0] - b[0]);

  const overlapsBusy = (s: number, e: number): boolean =>
    blocks.some(([bs, be]) => s < be && e > bs);

  const out: TimeSlot[] = [];
  const cursor = new Date(windowStart);
  cursor.setHours(0, 0, 0, 0);

  while (out.length < maxSuggestions) {
    const day = new Date(cursor);
    const dayOpen = new Date(day);
    dayOpen.setHours(dayStartHour, 0, 0, 0);
    const dayClose = new Date(day);
    dayClose.setHours(dayEndHour, 0, 0, 0);

    if (dayOpen.getTime() < windowEnd.getTime() && dayClose.getTime() > windowStart.getTime()) {
      const firstStart = Math.max(dayOpen.getTime(), windowStart.getTime());
      // Align the first candidate to the granularity grid.
      let t = Math.ceil(firstStart / stepMs) * stepMs;
      const lastStart = dayClose.getTime() - durationMs;
      while (t <= lastStart && out.length < maxSuggestions) {
        const e = t + durationMs;
        if (t >= windowStart.getTime() && e <= windowEnd.getTime() && !overlapsBusy(t, e)) {
          out.push({ start: new Date(t), end: new Date(e) });
        }
        t += stepMs;
      }
    }

    cursor.setDate(cursor.getDate() + 1);
    if (cursor.getTime() >= windowEnd.getTime()) break;
    // Safety: never scan more than 366 days even if the caller passes a wild window.
    if ((cursor.getTime() - windowStart.getTime()) / 86400000 > 366) break;
  }

  return out;
}

/**
 * Event duration in ms derived from the form's wall-clock inputs.
 * Falls back to 30 minutes when the inputs are missing or invalid —
 * the backend's own save path rejects empty dates anyway, so we never
 * want the panel to die on a half-filled form.
 */
export function formDurationMs(
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
): number {
  const s = Date.parse(`${startDate}T${startTime || '00:00'}:00`);
  const e = Date.parse(`${endDate || startDate}T${endTime || '00:00'}:00`);
  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return DEFAULT_DURATION_MS;
  return e - s;
}
