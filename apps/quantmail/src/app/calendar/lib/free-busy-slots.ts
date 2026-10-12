/**
 * "Find a time" slot suggestion — pure logic behind the CalendarEventForm
 * availability panel.
 *
 * Given busy blocks fetched from GET /api/calendar/events/free-busy (the
 * signed-in user's own calendar ONLY — the endpoint has no per-guest view),
 * this computes open slots inside a scanning window. Guest calendars are NOT
 * visible to QuantMail; the UI must say that honestly instead of inventing
 * availability.
 */

/** A busy interval as returned by the free-busy endpoint (ISO strings or Dates). */
export interface BusyIntervalInput {
  start: string | Date;
  end: string | Date;
}

/** One suggested open slot. */
export interface FreeSlot {
  start: Date;
  end: Date;
}

export interface SuggestSlotsOptions {
  /** Busy intervals (the user's own). */
  busy: BusyIntervalInput[];
  /** Scan window start (local time), e.g. 08:00 on the selected day. */
  windowStart: Date;
  /** Scan window end (local time), e.g. 20:00 on the selected day. */
  windowEnd: Date;
  /** Required free duration in minutes. */
  durationMin: number;
  /** Granularity in minutes between candidate start times (default 30). */
  stepMin?: number;
  /** Maximum suggestions to return (default 6). */
  maxSlots?: number;
  /** Epoch ms "now" — candidates starting before it are skipped (default Date.now()). */
  nowMs?: number;
}

/**
 * Suggest up to `maxSlots` open slots of `durationMin` minutes inside
 * [windowStart, windowEnd), stepping by `stepMin` minutes and skipping
 * anything that overlaps a busy block. Past slots are never suggested.
 */
export function suggestFreeSlots(opts: SuggestSlotsOptions): FreeSlot[] {
  const { windowStart, windowEnd, durationMin, busy } = opts;
  const stepMin = Math.max(5, opts.stepMin ?? 30);
  const maxSlots = Math.max(1, opts.maxSlots ?? 6);
  const nowMs = opts.nowMs ?? Date.now();
  const durationMs = Math.max(5, durationMin) * 60_000;

  const startMs = windowStart.getTime();
  const endMs = windowEnd.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return [];
  }

  // Normalize busy blocks: parse, clamp to the window, drop empties.
  const blocks = busy
    .map((b) => {
      const s = b.start instanceof Date ? b.start.getTime() : Date.parse(b.start);
      const e = b.end instanceof Date ? b.end.getTime() : Date.parse(b.end);
      if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
      return { start: Math.max(s, startMs), end: Math.min(e, endMs) };
    })
    .filter(
      (b): b is { start: number; end: number } => b !== null && b.end > b.start,
    )
    .sort((a, b) => a.start - b.start);

  const stepMs = stepMin * 60_000;
  const slots: FreeSlot[] = [];
  // Align the first candidate to the next step boundary at/after window start.
  let candidate = Math.ceil(startMs / stepMs) * stepMs;
  for (
    ;
    candidate + durationMs <= endMs && slots.length < maxSlots;
    candidate += stepMs
  ) {
    if (candidate < nowMs) continue; // never suggest the past
    const candidateEnd = candidate + durationMs;
    const overlaps = blocks.some((b) => candidate < b.end && candidateEnd > b.start);
    if (!overlaps) {
      slots.push({ start: new Date(candidate), end: new Date(candidateEnd) });
    }
  }
  return slots;
}

/** Human label for a slot, e.g. "10:30 – 11:00" (locale time). */
export function formatSlotLabel(slot: FreeSlot): string {
  const fmt = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${fmt.format(slot.start)} – ${fmt.format(slot.end)}`;
}

/**
 * Parse "HH:MM" (the shape <input type="time"> produces) into minutes since
 * midnight. Returns NaN for anything that isn't a valid time.
 */
export function parseTimeToMinutes(value: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!m) return NaN;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return NaN;
  return hours * 60 + minutes;
}
