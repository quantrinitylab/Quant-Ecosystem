// ============================================================================
// QuantCalendar — Booking Utilities (RFC 5545 ICS & Google Calendar URL)
// Tasks W39-CAL01 & W39-CAL02
//
// NOTE: applyBookingLinkResponse lives here (NOT in page.tsx) because
// Next.js build-time type validation rejects non-page exports from
// page.tsx ("X is not a valid Page export field").
// ============================================================================

// Generate Google Calendar deep link
export function generateGoogleCalendarUrl(event: {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  location?: string;
}): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const formatUtc = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(
      d.getUTCHours(),
    )}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

  const dates = `${formatUtc(event.startTime)}/${formatUtc(event.endTime)}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates,
    details: event.description || '',
    location: event.location || 'QuantMeet Video Call',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Generate RFC 5545 compliant .ics content
// hostName/hostEmail are the REAL host identity from the backend booking-link
// record. When unknown, pass '' — the ORGANIZER line is omitted rather than
// fabricating a person.
export function generateIcsContent(event: {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  hostName?: string;
  hostEmail?: string;
  attendeeName: string;
  attendeeEmail: string;
  uid?: string;
}): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const formatUtc = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(
      d.getUTCHours(),
    )}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

  const nowStr = formatUtc(new Date());
  const startStr = formatUtc(event.startTime);
  const endStr = formatUtc(event.endTime);
  const uid =
    event.uid || `quant-${Date.now()}-${Math.random().toString(36).slice(2, 9)}@quantmail.in`;

  // Honest identity: never attribute the meeting to a made-up person.
  // ORGANIZER is emitted only when a real host email is known.
  const organizerLine = event.hostEmail
    ? `ORGANIZER;CN=${event.hostName || 'Host'}:mailto:${event.hostEmail}`
    : null;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Quant Ecosystem//QuantCalendar Public Booking Engine//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${nowStr}`,
    `DTSTART:${startStr}`,
    `DTEND:${endStr}`,
    `SUMMARY:${event.title.replace(/\n/g, ' ')}`,
    `DESCRIPTION:${(event.description || '').replace(/\n/g, '\\n')}`,
    'STATUS:CONFIRMED',
    ...(organizerLine ? [organizerLine] : []),
    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=${event.attendeeName}:mailto:${event.attendeeEmail}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export interface BookingLinkDetails {
  slug: string;
  title: string;
  description: string;
  duration: number; // in minutes
  startHour: number;
  endHour: number;
  availableDays: number[];
  // IANA timezone anchoring the host's availability window
  // (fix/qm-booking-tz-availability-2). startHour/endHour/availableDays are
  // wall-clock values in this zone; slot labels render in the guest's zone.
  // 'UTC' when the backend record predates the field.
  timezone: string;
  // Real host identity from the backend booking-link record.
  // Empty string = unknown host (rendered honestly as "unknown host").
  hostName: string;
  hostEmail: string;
  hostAvatar?: string;
  // Whether the booking link is active. The public GET returns the record
  // even when the host paused it (no 410 on GET) — the client must treat
  // isActive === false as a dead link and never render the booking UI for it.
  isActive?: boolean;
}

/**
 * Merge a backend booking-link response into local meeting details.
 * Host identity comes ONLY from the backend record — when the backend
 * omits it, the result stays an honest "unknown" (''), never a hardcoded
 * name. Pure function so the merge rule is unit-testable.
 */
export function applyBookingLinkResponse(
  prev: BookingLinkDetails,
  data: Record<string, any> | null | undefined,
): BookingLinkDetails {
  if (!data) return prev;
  return {
    ...prev,
    slug: data.slug || prev.slug,
    title: data.title || prev.title,
    description: data.description || prev.description,
    duration: data.duration || prev.duration,
    startHour: data.startHour ?? prev.startHour,
    endHour: data.endHour ?? prev.endHour,
    availableDays: data.availableDays || prev.availableDays,
    // The backend normalizes the stored value; default 'UTC' for records
    // created before the field existed (fix/qm-booking-tz-availability-2).
    timezone:
      typeof data.timezone === 'string' && data.timezone.trim()
        ? data.timezone
        : prev.timezone || 'UTC',
    hostName: data.hostName || '',
    hostEmail: data.hostEmail || '',
    isActive: data.isActive ?? prev.isActive ?? true,
  };
}

/**
 * Honest load state for a failed booking-link GET (fix/qm-booking-deadlink-details).
 *
 * A dead or unreachable booking link must NEVER keep the seeded meeting
 * details ("30 Min Strategy Session" + "Unknown host") on screen as if they
 * were real, and a network failure must NEVER invent a meeting title from
 * the URL slug. Every failure resolves to one honest state:
 *   404 → 'not-found'   (link deleted / never existed)
 *   410 → 'inactive'    (host paused the link; also used when the GET
 *                         returns 200 with isActive === false — the public
 *                         GET never 410s on its own)
 *   else → 'error'      (server trouble, network failure, malformed payload)
 * Pure function so the mapping is unit-testable.
 *
 * Backend codes (booking-link.service.ts): 404 BOOKING_LINK_NOT_FOUND,
 * 410 BOOKING_LINK_INACTIVE. Status 0 = network failure (no response).
 */
export type BookingLinkLoadStatus = 'not-found' | 'inactive' | 'error';

export function resolveLinkLoadFailure(
  status: number,
  serverMessage?: string,
): { status: BookingLinkLoadStatus; message: string } {
  if (status === 0) {
    return {
      status: 'error',
      message: 'Could not reach the booking server. Check your connection and try again.',
    };
  }
  switch (status) {
    case 404:
      return {
        status: 'not-found',
        message: serverMessage || 'This booking link no longer exists or was removed.',
      };
    case 410:
      return {
        status: 'inactive',
        message:
          serverMessage || 'This booking link is no longer active. Please ask the host for a new link.',
      };
    case 400:
      return {
        status: 'error',
        message:
          serverMessage || 'This booking link looks invalid. Please check the URL and try again.',
      };
    case 429:
      return {
        status: 'error',
        message: 'Too many requests. Please wait a moment and try again.',
      };
    case 500:
    case 502:
    case 503:
    case 504:
      return {
        status: 'error',
        message: 'The booking server ran into a problem. Please try again.',
      };
    default:
      return {
        status: 'error',
        message: serverMessage || 'Could not load this booking link. Please try again.',
      };
  }
}

/**
 * Honest user-facing copy for a failed booking POST (fix/qm-booking-fake-confirm).
 * A non-2xx booking response — or a network failure (status 0) — must NEVER
 * advance to the confirmation screen, and the booker must see the REAL reason
 * (slot taken, link inactive/invalid, retry) instead of a fake "Booking
 * Confirmed!". Pure function so the mapping is unit-testable.
 *
 * Backend status codes (booking-link.service.ts):
 *   400 INVALID_BOOKING_SLOT | 404 BOOKING_LINK_NOT_FOUND |
 *   410 BOOKING_LINK_INACTIVE | 409 SLOT_UNAVAILABLE
 */
export function resolveBookingFailureMessage(
  status: number,
  serverMessage?: string,
): string {
  // Network failure (no response at all) — the booking may never have
  // reached the server, so never imply success or any specific reason.
  if (status === 0) {
    return 'Could not reach the booking server. Check your connection and try again.';
  }
  switch (status) {
    case 400:
      return serverMessage || 'The booking details look invalid. Please check the form and try again.';
    case 404:
      return serverMessage || 'This booking link no longer exists or was removed.';
    case 409:
      return (
        serverMessage ||
        'This slot was just taken by someone else. Please go back and choose another time.'
      );
    case 410:
      return (
        serverMessage ||
        'This booking link is no longer active. Please ask the host for a new link.'
      );
    case 429:
      return 'Too many booking attempts. Please wait a moment and try again.';
    case 500:
    case 502:
    case 503:
    case 504:
      // Never surface raw backend/edge messages on 5xx (may be technical) —
      // honest retry guidance instead.
      return 'The booking server ran into a problem. Please try again.';
    default:
      return serverMessage || 'Booking could not be completed. Please try again.';
  }
}

export interface BookingSlotItem {
  start: Date;
  end: Date;
  timeLabel: string;
  available: boolean;
}

/**
 * Slots-response authority rule (fix/qm-booking-fullybooked-slots).
 *
 * The slots endpoint honestly answers { success: true, data: [] } when the
 * link has no bookable time on the date — booking-link.service
 * getAvailableSlots returns [] for inactive links and for days outside the
 * link's availableDays, and marks every slot available:false when the day is
 * fully booked. An EMPTY array is an authoritative answer: the page must
 * render the honest "no slots" state. It must NEVER fall through to the
 * client-side slot generator, which would invent bookable slots the backend
 * rejects at submit with 409 SLOT_UNAVAILABLE.
 *
 * Returns the mapped slots (possibly []) when the payload is authoritative,
 * or null when the fetch did not produce a usable answer (success !== true
 * or data not an array) so the caller takes the genuine-failure path.
 * Pure function so the rule is unit-testable.
 *
 * timeZone: the guest's selected IANA timezone — slot labels are rendered in
 * it (fix/qm-booking-tz-selector). Defaults to UTC for callers that do not
 * carry a guest selection.
 */
export function resolveSlotsResponse(
  json: unknown,
  timeZone: string = 'UTC',
): BookingSlotItem[] | null {
  if (
    typeof json !== 'object' ||
    json === null ||
    (json as { success?: unknown }).success !== true ||
    !Array.isArray((json as { data?: unknown }).data)
  ) {
    return null;
  }
  const data = (json as { data: unknown[] }).data;
  return data.map((s: any) => {
    const start = new Date(s.start);
    const end = new Date(s.end);
    return {
      start,
      end,
      timeLabel: formatSlotTimeLabelInTz(start, timeZone),
      available: s.available ?? true,
    };
  });
}

// ============================================================================
// Guest-timezone wall-time math (fix/qm-booking-tz-selector).
// The booking page's timezone selector must shift displayed slot times AND
// the date boundary. These pure helpers convert guest-local wall-clock times
// in an IANA zone to UTC instants and render labels in that zone — the same
// math the backend applies in booking-link.service getAvailableSlots.
// ============================================================================

/** Offset (local wall-clock time minus UTC) in ms for `timeZone` at a UTC instant. */
export function bookingTzOffsetMs(timeZone: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // hour12:false can yield "24" at midnight; normalize.
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  return asUtc - utcMs;
}

/**
 * Convert a guest-local wall time (year/month/day/hour/minute in `timeZone`)
 * to the matching UTC instant. Iterates to a fixed point so DST transitions
 * between midnight and the slot are respected.
 */
export function bookingWallTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  for (let i = 0; i < 3; i++) {
    const next = Date.UTC(year, month - 1, day, hour, minute) - bookingTzOffsetMs(timeZone, guess);
    if (next === guess) break;
    guess = next;
  }
  return guess;
}

/** "09:30 AM" label rendered in the guest's selected timezone. */
export function formatSlotTimeLabelInTz(d: Date, timeZone: string): string {
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone,
  });
}

// ============================================================================
// Guest-day request contract (fix/qm-booking-guest-day).
// The slots request must name the GUEST's calendar day in the SELECTED
// timezone — not the browser-local date. Sending browser-local Y/M/D while
// the user picked another zone silently shifts the date boundary.
// ============================================================================

/** YYYY-MM-DD of the instant's calendar day in `timeZone`. */
export function formatDateToYmdInTz(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * Defensive guest-day filter (fix/qm-booking-guest-day).
 *
 * The backend returns only slots whose instants fall inside the requested
 * guest-day interval; this re-applies that rule client-side so a stale
 * backend (deploy skew) can never surface next-day or missing-day slots
 * under the guest's selected date. Pure function, unit-testable.
 *
 * dateStr: the YYYY-MM-DD the request named (in timeZone).
 */
export function slotsWithinGuestDay<T extends { start: Date }>(
  slots: T[],
  dateStr: string,
  timeZone: string,
): T[] {
  return slots.filter((s) => formatDateToYmdInTz(s.start, timeZone) === dateStr);
}

// ============================================================================
// Guest-day slot generation for the client fallback path
// (fix/qm-booking-guest-day). The fallback claims the same contract as the
// slots API, so it follows the same rule: the requested day is the GUEST's
// calendar day in their selected zone; slots are generated from the
// host-local date(s) the interval spans and filtered to the interval.
// ============================================================================

export interface GuestDaySlotSpec {
  /** The requested guest-local calendar day (in guestTimeZone). */
  year: number;
  month: number;
  day: number;
  guestTimeZone: string;
  hostTimeZone: string;
  startHour: number;
  endHour: number;
  durationMin: number;
}

/** Calendar-date parts (year/month/day) of a UTC instant in `timeZone`. */
function zonedYmdParts(d: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day') };
}

// ============================================================================
// Timezone-free guest-day keys (fix/qm-booking-journey-v2).
//
// The old page carried the selected day as a browser-local `Date` (midnight
// in the BROWSER's zone) and re-derived the requested YYYY-MM-DD with
// `formatDateToYmdInTz(selectedDate, selectedTimezone)`. For a guest whose
// browser zone differs from the selected zone, browser-local midnight lands
// on a DIFFERENT calendar day in the selected zone — the request silently
// named the wrong day (off-by-one). The selected day is now a plain
// {year, month, day} key in the selected zone: no Date is ever constructed,
// so no zone can reinterpret it. The key serializes to YYYY-MM-DD directly.
// ============================================================================

/** A calendar day in a named zone, carried without any Date instant. */
export interface GuestDayKey {
  year: number;
  month: number;
  day: number;
}

/** YYYY-MM-DD — the exact string the slots API's `date` param must name. */
export function guestDayKeyToYmd(key: GuestDayKey): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${key.year}-${pad(key.month)}-${pad(key.day)}`;
}

/** -1 / 0 / 1 calendar-day comparison of two keys (timezone-free). */
export function compareGuestDayKeys(a: GuestDayKey, b: GuestDayKey): number {
  if (a.year !== b.year) return a.year < b.year ? -1 : 1;
  if (a.month !== b.month) return a.month < b.month ? -1 : 1;
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  return 0;
}

/** Add (or subtract) whole calendar days — pure UTC math, no zone involved. */
export function addDaysToKey(key: GuestDayKey, n: number): GuestDayKey {
  const d = new Date(Date.UTC(key.year, key.month - 1, key.day + n));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Today's calendar day in `timeZone` (Intl parts — never browser-local). */
export function todayInTimeZone(timeZone: string): GuestDayKey {
  return zonedYmdParts(new Date(), timeZone);
}

/** Weekday (0=Sun … 6=Sat) of a calendar day in `timeZone`; noon dodges DST-midnight edges. */
export function weekdayInTimeZone(key: GuestDayKey, timeZone: string): number {
  const noonUtc = bookingWallTimeToUtcMs(key.year, key.month, key.day, 12, 0, timeZone);
  const name = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(
    new Date(noonUtc),
  );
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

/**
 * Every host calendar date intersecting the guest-day interval
 * (fix/qm-booking-journey-v2). Walks host midnights instead of sampling
 * the two endpoints, so a DST transition can never omit the middle host
 * date (the 23h spring-forward day lets a 24h interval cross two host
 * midnights). Mirrors the backend's hostDatesForGuestDayInterval.
 */
export function hostDatesForGuestDayInterval(
  intervalStartMs: number,
  intervalEndMs: number,
  timeZone: string,
): GuestDayKey[] {
  const out: GuestDayKey[] = [];
  const seen = new Set<string>();
  if (!Number.isFinite(intervalStartMs) || !Number.isFinite(intervalEndMs)) return out;
  if (intervalEndMs <= intervalStartMs) return out;
  let cursor = intervalStartMs;
  for (let i = 0; i < 8 && cursor < intervalEndMs; i++) {
    const ymd = zonedYmdParts(new Date(cursor), timeZone);
    const key = `${ymd.year}-${ymd.month}-${ymd.day}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(ymd);
    }
    const nextMidnight = bookingWallTimeToUtcMs(ymd.year, ymd.month, ymd.day + 1, 0, 0, timeZone);
    cursor = nextMidnight > cursor ? nextMidnight : cursor + 24 * 60 * 60 * 1000;
  }
  return out;
}

/**
 * Slot-authoritative day enablement (fix/qm-booking-journey-v2).
 *
 * The old calendar grid enabled a tile with the BROWSER-LOCAL weekday
 * (`availableDays.includes(d.getDay())`). For a guest whose browser zone
 * differs from the host zone that mask disables VALID days (and enables
 * days whose host-side window is actually closed). A day is now enabled
 * iff at least one host calendar date intersecting the guest-day interval
 * has its HOST-timezone weekday in availableDays — i.e. the host can
 * genuinely produce slots inside this guest day. Pure function.
 */
export function isGuestDayEnabled(
  key: GuestDayKey,
  guestTimeZone: string,
  hostTimeZone: string,
  availableDays: number[],
): boolean {
  const intervalStart = bookingWallTimeToUtcMs(key.year, key.month, key.day, 0, 0, guestTimeZone);
  const intervalEnd = bookingWallTimeToUtcMs(key.year, key.month, key.day + 1, 0, 0, guestTimeZone);
  const hostDates = hostDatesForGuestDayInterval(intervalStart, intervalEnd, hostTimeZone);
  return hostDates.some((hd) => availableDays.includes(weekdayInTimeZone(hd, hostTimeZone)));
}

/**
 * Summary-header label for a guest-day key: "Monday, Oct 13, 2026" —
 * built from a UTC midnight instant so no zone can reinterpret the day.
 */
export function formatGuestDayHeader(key: GuestDayKey): string {
  return new Date(Date.UTC(key.year, key.month - 1, key.day)).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Compact "Oct 13" label for a guest-day key (UTC midnight, zone-free). */
export function formatGuestDayShort(key: GuestDayKey): string {
  return new Date(Date.UTC(key.year, key.month - 1, key.day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Default selected day: tomorrow in the guest zone, skipping forward past
 * days the host cannot serve (fix/qm-booking-journey-v2). The seed assumes
 * the pre-load placeholder window (Mon–Fri, UTC anchor) — the real link
 * record refines enablement through isGuestDayEnabled once loaded.
 */
export function defaultSelectedGuestDay(guestTimeZone: string): GuestDayKey {
  let key = addDaysToKey(todayInTimeZone(guestTimeZone), 1);
  for (let i = 0; i < 7; i++) {
    if (isGuestDayEnabled(key, guestTimeZone, 'UTC', [1, 2, 3, 4, 5])) return key;
    key = addDaysToKey(key, 1);
  }
  return key;
}

/**
 * Pure guest-day slot generation mirroring the backend contract. Labels are
 * rendered in the guest's zone; every slot's guest-local calendar day
 * equals the requested day. Never invents slots for other days.
 */
export function generateGuestDaySlots(spec: GuestDaySlotSpec): BookingSlotItem[] {
  const { year, month, day, guestTimeZone, hostTimeZone, startHour, endHour, durationMin } = spec;
  const intervalStart = bookingWallTimeToUtcMs(year, month, day, 0, 0, guestTimeZone);
  const intervalEnd = bookingWallTimeToUtcMs(year, month, day + 1, 0, 0, guestTimeZone);

  // Walk host midnights (fix/qm-booking-journey-v2) — endpoint sampling
  // omits the middle host date around DST transitions.
  const hostDates = hostDatesForGuestDayInterval(intervalStart, intervalEnd, hostTimeZone);

  const now = Date.now();
  const slots: BookingSlotItem[] = [];
  for (const hd of hostDates) {
    const totalMinutes = (endHour - startHour) * 60;
    for (let offsetMin = 0; offsetMin + durationMin <= totalMinutes; offsetMin += durationMin) {
      const wallMinutes = startHour * 60 + offsetMin;
      const slotStart = new Date(
        bookingWallTimeToUtcMs(
          hd.year,
          hd.month,
          hd.day,
          Math.floor(wallMinutes / 60),
          wallMinutes % 60,
          hostTimeZone,
        ),
      );
      const t = slotStart.getTime();
      if (t < intervalStart || t >= intervalEnd) continue;
      const slotEnd = new Date(t + durationMin * 60 * 1000);
      slots.push({
        start: slotStart,
        end: slotEnd,
        timeLabel: formatSlotTimeLabelInTz(slotStart, guestTimeZone),
        available: t > now + 15 * 60 * 1000,
      });
    }
  }
  slots.sort((a, b) => a.start.getTime() - b.start.getTime());
  return slots;
}
