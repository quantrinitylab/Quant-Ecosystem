import { randomUUID } from 'node:crypto';
import { createAppError } from '@quant/server-core';
import { RecurringService, type CalendarEvent } from './recurring.service';

export interface BookingLink {
  id: string;
  userId: string;
  slug: string;
  title: string;
  hostTitle?: string;
  description: string;
  duration: number;
  availableDays: number[];
  startHour: number;
  endHour: number;
  // IANA timezone anchoring the availability window
  // (fix/qm-booking-tz-availability-2). startHour/endHour/availableDays are
  // wall-clock values in this zone — never server-local. 'UTC' for legacy
  // links created before the field existed.
  timezone: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Public host identity, resolved from the owning user record.
  // Null = the backend could not resolve the link owner (honest "unknown host").
  hostName: string | null;
  hostEmail: string | null;
}
export interface BookingSlot {
  start: Date;
  end: Date;
  available: boolean;
}
export interface BookerInfo {
  name: string;
  email: string;
  notes?: string;
}
export interface CreateBookingLinkInput {
  userId: string;
  slug: string;
  title: string;
  description?: string;
  duration: number;
  availableDays?: number[];
  startHour?: number;
  endHour?: number;
  // Host's IANA timezone (fix/qm-booking-tz-availability-2); invalid or
  // missing values normalize to 'UTC' in createBookingLink.
  timezone?: string;
}
export interface SlotLock {
  lockId: string;
  slug: string;
  userId: string;
  slotTime: number;
  bookerEmail: string;
  expiresAt: Date;
}

/**
 * Prisma unique-constraint violation (P2002), duck-typed on `code` so the
 * check works without importing the generated client — same style as
 * routes/auth.ts and services/collab-persistence.ts. BookingLink.slug is
 * globally @unique (not per-user); two hosts racing on the same slug is a
 * P2002, never a 500.
 */
function isUniqueConstraintViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'P2002';
}
export interface BookingConfirmationResult {
  event: unknown;
  icsContent: string;
  // Real host identity of the booking-link owner (null when unresolvable).
  hostName: string | null;
  hostEmail: string | null;
}
export interface PrismaClient {
  bookingLink: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<unknown>;
    findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
    delete?: (args: { where: Record<string, unknown> }) => Promise<unknown>;
  };
  event: {
    findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
  user?: {
    findUnique: (args: {
      where: Record<string, unknown>;
      select?: Record<string, unknown>;
    }) => Promise<unknown>;
  };
}

export const LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Near-future buffer (fix/qm-booking-past-slots): getAvailableSlots marks a
 * slot as NOT bookable when it starts at or before now + this buffer.
 * Mirrors the public booking page's client-side slot generator, which only
 * treats `slotStart > now + 15min` as future. Server time is the source of
 * truth; lockSlot/confirmBooking still reject genuinely past slots with the
 * honest 400 INVALID_BOOKING_SLOT for race cases.
 */
export const BOOKING_SLOT_FUTURE_BUFFER_MS = 15 * 60 * 1000; // 15 minutes

// ============================================================================
// Guest-timezone slot math (public booking page timezone selector).
//
// CONTRACT (fix/qm-booking-tz-availability-2): the host's
// startHour/endHour/availableDays are wall-clock values in the LINK's
// timezone (hostAnchorTimeZone) — never the server's, and no longer the
// guest's. The guest's selected timezone is display-only: the public page
// formats the returned absolute instants in it. The requested calendar day
// is interpreted in the host's timezone.
// Pure Intl-based math — no extra date library required.
// ============================================================================

const tzPartsFormatterCache = new Map<string, Intl.DateTimeFormat>();
const tzWeekdayFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getTzPartsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = tzPartsFormatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    tzPartsFormatterCache.set(timeZone, f);
  }
  return f;
}

/** True when `tz` is a usable IANA timezone name (invalid names fall back to legacy server-tz behavior). */
export function isValidIanaTimeZone(tz: string): boolean {
  if (typeof tz !== 'string' || tz.trim() === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Offset (local wall-clock time minus UTC) in milliseconds for `timeZone` at the given UTC instant. */
export function tzOffsetMs(timeZone: string, utcMs: number): number {
  const parts = getTzPartsFormatter(timeZone).formatToParts(new Date(utcMs));
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
export function zonedWallTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  for (let i = 0; i < 3; i++) {
    const next = Date.UTC(year, month - 1, day, hour, minute) - tzOffsetMs(timeZone, guess);
    if (next === guess) break;
    guess = next;
  }
  return guess;
}

/** Guest-local weekday (0=Sun … 6=Sat) of a calendar day in `timeZone`. Noon is used to dodge DST-midnight edges. */
export function zonedWeekday(year: number, month: number, day: number, timeZone: string): number {
  let f = tzWeekdayFormatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' });
    tzWeekdayFormatterCache.set(timeZone, f);
  }
  const noonUtc = zonedWallTimeToUtcMs(year, month, day, 12, 0, timeZone);
  const name = f.format(new Date(noonUtc));
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

/**
 * The timezone anchoring a booking link's availability window
 * (fix/qm-booking-tz-availability-2). Host hours are wall-clock values in
 * this zone — never the server's. Records created before the timezone field
 * existed normalize to 'UTC', matching the previous server-tz behavior on
 * UTC servers.
 */
export function hostAnchorTimeZone(link: { timezone?: unknown }): string {
  const tz = typeof link.timezone === 'string' ? link.timezone.trim() : '';
  return isValidIanaTimeZone(tz) ? tz : 'UTC';
}

/** Calendar-date parts (year/month/day) of a UTC instant in `timeZone`. */
export function zonedYmd(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = getTzPartsFormatter(timeZone).formatToParts(date);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/**
 * Every host calendar date intersecting [intervalStartMs, intervalEndMs) in
 * `timeZone` (fix/qm-booking-journey-v2).
 *
 * The old code sampled only the two interval endpoints. Around DST
 * transitions that silently omits the middle host date: e.g. a 24h guest-day
 * interval over a spring-forward Sunday spans THREE host calendar dates
 * (the 23h day lets the interval cross two host midnights), so slots for
 * the middle date were never generated — the guest saw a valid day with
 * missing slots. Walking host midnights through the interval enumerates
 * every intersected date on both 23h and 25h days. Pure function.
 */
export function hostDatesForGuestDayInterval(
  intervalStartMs: number,
  intervalEndMs: number,
  timeZone: string,
): Array<{ year: number; month: number; day: number }> {
  const out: Array<{ year: number; month: number; day: number }> = [];
  const seen = new Set<string>();
  if (!Number.isFinite(intervalStartMs) || !Number.isFinite(intervalEndMs)) return out;
  if (intervalEndMs <= intervalStartMs) return out;
  let cursor = intervalStartMs;
  // Safety cap: a guest-day interval is ~24h; 8 iterations is generous.
  for (let i = 0; i < 8 && cursor < intervalEndMs; i++) {
    const ymd = zonedYmd(new Date(cursor), timeZone);
    const key = `${ymd.year}-${ymd.month}-${ymd.day}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(ymd);
    }
    const nextMidnight = zonedWallTimeToUtcMs(ymd.year, ymd.month, ymd.day + 1, 0, 0, timeZone);
    cursor = nextMidnight > cursor ? nextMidnight : cursor + 24 * 60 * 60 * 1000;
  }
  return out;
}

export function formatIcsDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

export function generateIcsInvite(options: {
  uid: string;
  summary: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  organizer: { name: string; email: string };
  attendee: { name: string; email: string };
  status?: string;
}): string {
  const dtStamp = formatIcsDateTime(new Date());
  const dtStart = formatIcsDateTime(options.startTime);
  const dtEnd = formatIcsDateTime(options.endTime);
  const status = options.status || 'CONFIRMED';
  const cleanSummary = (options.summary || '').replace(/\r?\n/g, ' ');
  const cleanDescription = (options.description || '').replace(/\r?\n/g, '\\n');
  const orgName = (options.organizer.name || 'Host').replace(/[:;]/g, '');
  const attName = (options.attendee.name || 'Attendee').replace(/[:;]/g, '');
  // Honest identity: never fabricate an organizer address. When the host
  // email is unknown, the ORGANIZER line is omitted entirely instead of
  // inventing one.
  const organizerLine = options.organizer.email
    ? `ORGANIZER;CN=${orgName}:mailto:${options.organizer.email}`
    : null;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//QuantMail//Calendar Booking Engine//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${options.uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${cleanSummary}`,
    `DESCRIPTION:${cleanDescription}`,
    ...(organizerLine ? [organizerLine] : []),
    `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=${attName}:mailto:${options.attendee.email}`,
    `STATUS:${status}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export class SlotLockStore {
  private locks = new Map<string, SlotLock>();

  cleanup(): void {
    const now = Date.now();
    for (const [id, lock] of this.locks.entries()) {
      if (lock.expiresAt.getTime() <= now) {
        this.locks.delete(id);
      }
    }
  }

  getLock(lockId: string): SlotLock | undefined {
    this.cleanup();
    return this.locks.get(lockId);
  }

  getActiveLock(slug: string, userId: string, slotTimeMs: number): SlotLock | undefined {
    this.cleanup();
    const now = Date.now();
    for (const lock of this.locks.values()) {
      if (lock.expiresAt.getTime() <= now) continue;
      if ((lock.slug === slug || lock.userId === userId) && lock.slotTime === slotTimeMs) {
        return lock;
      }
    }
    return undefined;
  }

  isSlotLocked(slug: string, userId: string, slotTimeMs: number): boolean {
    return this.getActiveLock(slug, userId, slotTimeMs) !== undefined;
  }

  setLock(lock: SlotLock): void {
    this.cleanup();
    this.locks.set(lock.lockId, lock);
  }

  removeLock(lockId: string): boolean {
    return this.locks.delete(lockId);
  }

  clear(): void {
    this.locks.clear();
  }
}

export const globalSlotLockStore = new SlotLockStore();

const MAX_SLOT_WINDOW_MS = 24 * 60 * 60 * 1000;

export class BookingLinkService {
  constructor(private readonly prisma: PrismaClient) {}

  static clearLocks(): void {
    globalSlotLockStore.clear();
  }

  /**
   * Resolve the booking-link owner's real identity from the user record.
   * Returns null when the owner cannot be resolved — callers must then use
   * an honest "unknown host" placeholder and never fabricate a name/email.
   */
  private async resolveHost(userId: string): Promise<{ hostName: string; hostEmail: string } | null> {
    if (!this.prisma.user?.findUnique) return null;
    try {
      const user = (await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, displayName: true },
      })) as { email?: string; displayName?: string } | null;
      if (!user?.email) return null;
      return {
        hostName: user.displayName || user.email,
        hostEmail: user.email,
      };
    } catch {
      return null;
    }
  }

  async createBookingLink(input: CreateBookingLinkInput): Promise<BookingLink> {
    const now = new Date();
    let link;
    try {
      link = await this.prisma.bookingLink.create({
        data: {
          userId: input.userId,
          slug: input.slug,
          title: input.title,
          description: input.description ?? '',
          duration: input.duration,
          availableDays: JSON.stringify(input.availableDays ?? [1, 2, 3, 4, 5]),
          startHour: input.startHour ?? 9,
          endHour: input.endHour ?? 17,
          timezone: hostAnchorTimeZone({ timezone: input.timezone }),
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      });
    } catch (err) {
      // BookingLink.slug is globally @unique (not per-user): a host creating
      // a link whose slug another host already took hits P2002 (a pre-check
      // would be TOCTOU). Map it to an honest 409 BOOKING_LINK_SLUG_TAKEN so
      // the client can tell the host to pick another slug — before this fix
      // the unmapped P2002 escaped as a raw 500 and the modal kept a
      // permanently unsyncable local copy (fix/qm-booking-slug-409).
      if (isUniqueConstraintViolation(err)) {
        throw createAppError(
          'This URL slug is already taken — pick another',
          409,
          'BOOKING_LINK_SLUG_TAKEN',
        );
      }
      throw err;
    }
    return this.toBookingLink(link);
  }

  async getBookingLink(slug: string): Promise<BookingLink> {
    const link = await this.prisma.bookingLink.findUnique({ where: { slug } });
    if (!link) throw createAppError('Booking link not found', 404, 'BOOKING_LINK_NOT_FOUND');
    const base = this.toBookingLink(link);
    // Public endpoint: attach the real host identity from the owning user
    // record (or nulls → the client renders an honest "unknown host").
    const host = await this.resolveHost(base.userId);
    return {
      ...base,
      hostName: host?.hostName ?? null,
      hostEmail: host?.hostEmail ?? null,
    };
  }

  async deleteBookingLink(id: string, userId: string): Promise<void> {
    const link = (await this.prisma.bookingLink.findUnique({ where: { id } })) as Record<
      string,
      unknown
    > | null;
    if (!link || link['userId'] !== userId) {
      throw createAppError('Booking link not found', 404, 'BOOKING_LINK_NOT_FOUND');
    }
    if (this.prisma.bookingLink.delete) {
      await this.prisma.bookingLink.delete({ where: { id } });
    }
  }

  async lockSlot(
    slug: string,
    slotTime: Date,
    bookerEmail: string,
  ): Promise<{ lockId: string; expiresAt: Date }> {
    const link = await this.getBookingLink(slug);
    if (!link.isActive)
      throw createAppError('Booking link is inactive', 410, 'BOOKING_LINK_INACTIVE');

    const startTime = new Date(slotTime);
    if (Number.isNaN(startTime.getTime()))
      throw createAppError('Invalid booking slot', 400, 'INVALID_BOOKING_SLOT');

    const endTime = new Date(startTime.getTime() + link.duration * 60 * 1000);
    // Availability window check in the HOST's timezone
    // (fix/qm-booking-tz-availability-2) — the slot's host-local calendar
    // day must be an available day and the slot must sit inside the
    // host-local [startHour, endHour) window. Never server-local.
    const anchorTz = hostAnchorTimeZone(link);
    const { year, month, day } = zonedYmd(startTime, anchorTz);
    const dayStart = new Date(zonedWallTimeToUtcMs(year, month, day, link.startHour, 0, anchorTz));
    const dayEnd = new Date(zonedWallTimeToUtcMs(year, month, day, link.endHour, 0, anchorTz));
    const availableDays = (link.availableDays ?? [1, 2, 3, 4, 5]).map(Number);

    if (
      startTime.getTime() < Date.now() ||
      !availableDays.includes(zonedWeekday(year, month, day, anchorTz)) ||
      startTime.getTime() < dayStart.getTime() ||
      endTime.getTime() > dayEnd.getTime()
    ) {
      throw createAppError(
        'Requested slot is outside the booking link availability',
        400,
        'INVALID_BOOKING_SLOT',
      );
    }

    const existingEvents = await this.prisma.event.findMany({
      where: {
        userId: link.userId,
        recurrenceRule: null,
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });
    if (existingEvents.length > 0)
      throw createAppError('Slot is no longer available', 409, 'SLOT_UNAVAILABLE');

    const recurringEvents = (await this.prisma.event.findMany({
      where: { userId: link.userId, recurrenceRule: { not: null }, startTime: { lte: dayEnd } },
      take: 200,
    })) as Array<Record<string, unknown>>;
    const recurringService = new RecurringService(this.prisma as any);
    const expandedOccurrences = recurringEvents.flatMap((event) =>
      recurringService.expandOccurrences(this.toCalendarEvent(event), dayStart, dayEnd),
    );
    if (
      expandedOccurrences.some(
        (occurrence) => startTime < occurrence.endTime && endTime > occurrence.startTime,
      )
    ) {
      throw createAppError('Selected slot is no longer available', 409, 'SLOT_UNAVAILABLE');
    }

    const normalizedEmail = bookerEmail.trim().toLowerCase();
    const existingLock = globalSlotLockStore.getActiveLock(slug, link.userId, startTime.getTime());
    if (existingLock) {
      if (existingLock.bookerEmail === normalizedEmail) {
        existingLock.expiresAt = new Date(Date.now() + LOCK_TTL_MS);
        return { lockId: existingLock.lockId, expiresAt: existingLock.expiresAt };
      }
      throw createAppError('Slot is currently locked by another booker', 409, 'SLOT_UNAVAILABLE');
    }

    const lockId = `lock_${randomUUID()}`;
    const expiresAt = new Date(Date.now() + LOCK_TTL_MS);
    globalSlotLockStore.setLock({
      lockId,
      slug,
      userId: link.userId,
      slotTime: startTime.getTime(),
      bookerEmail: normalizedEmail,
      expiresAt,
    });

    return { lockId, expiresAt };
  }

  async releaseLock(lockId: string): Promise<void> {
    globalSlotLockStore.removeLock(lockId);
  }

  async getAvailableSlots(
    slug: string,
    date: Date,
    guestTimezone?: string,
  ): Promise<BookingSlot[]> {
    const link = await this.getBookingLink(slug);
    if (!link.isActive) return [];
    const slotDuration = link.duration * 60 * 1000;
    // Availability window anchor (fix/qm-booking-tz-availability-2): the
    // host's startHour/endHour/availableDays are wall-clock values in the
    // LINK's timezone — never the server's, and no longer the guest's.
    const anchorTz = hostAnchorTimeZone(link);

    // Guest-day contract (fix/qm-booking-guest-day): when the caller
    // supplies a guest timezone, the requested YYYY-MM-DD is the GUEST's
    // calendar day in that zone — not the host's. The selected guest-day
    // interval is converted to UTC, slots are generated for the host-local
    // date(s) the interval spans, and ONLY slots whose instants fall
    // inside the requested interval are returned — the guest never sees
    // missing slots or slots labeled on another day.
    // An invalid IANA zone is an honest 400 (never silent UTC fallback).
    // No tz → legacy host-day interpretation (API compatibility).
    let guestDayStartMs: number | null = null;
    let guestDayEndMs: number | null = null;
    if (guestTimezone !== undefined && guestTimezone !== null && guestTimezone !== '') {
      if (!isValidIanaTimeZone(guestTimezone)) {
        throw createAppError(`Invalid guest timezone: ${guestTimezone}`, 400, 'INVALID_TIMEZONE');
      }
      const gy = date.getUTCFullYear();
      const gm = date.getUTCMonth() + 1;
      const gd = date.getUTCDate();
      guestDayStartMs = zonedWallTimeToUtcMs(gy, gm, gd, 0, 0, guestTimezone);
      guestDayEndMs = zonedWallTimeToUtcMs(gy, gm, gd + 1, 0, 0, guestTimezone);
    }

    // Host-local calendar dates to generate slots for: the single host day
    // (legacy path) or every host date intersecting the guest-day interval.
    // A 24h guest-day interval can intersect up to three host calendar
    // dates around a DST transition (the 23h spring-forward day lets it
    // cross two host midnights) — hostDatesForGuestDayInterval walks the
    // host midnights so the middle date is never omitted.
    const hostDates: Array<{ year: number; month: number; day: number }> = [];
    if (guestDayStartMs !== null && guestDayEndMs !== null) {
      hostDates.push(...hostDatesForGuestDayInterval(guestDayStartMs, guestDayEndMs, anchorTz));
    } else {
      hostDates.push({
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
      });
    }

    // Candidate slot start instants + the busy-query window, resolved in the
    // host's timezone (wall-clock startHour/endHour per host date).
    let slotStarts: Date[] = [];
    let windowStart: Date | null = null;
    let windowEnd: Date | null = null;

    for (const { year, month, day } of hostDates) {
      if (!link.availableDays.includes(zonedWeekday(year, month, day, anchorTz))) continue;
      const starts: Date[] = [];
      const totalMinutes = (link.endHour - link.startHour) * 60;
      for (let offsetMin = 0; offsetMin + link.duration <= totalMinutes; offsetMin += link.duration) {
        const wallMinutes = link.startHour * 60 + offsetMin;
        starts.push(
          new Date(
            zonedWallTimeToUtcMs(
              year,
              month,
              day,
              Math.floor(wallMinutes / 60),
              wallMinutes % 60,
              anchorTz,
            ),
          ),
        );
      }
      slotStarts = slotStarts.concat(starts);
      const dayWindowStart =
        starts.length > 0
          ? starts[0]
          : new Date(zonedWallTimeToUtcMs(year, month, day, link.startHour, 0, anchorTz));
      const dayEndUtc = zonedWallTimeToUtcMs(year, month, day, link.endHour, 0, anchorTz);
      const dayWindowEnd = new Date(
        Math.min(dayEndUtc, dayWindowStart.getTime() + MAX_SLOT_WINDOW_MS),
      );
      if (windowStart === null || dayWindowStart < windowStart) windowStart = dayWindowStart;
      if (windowEnd === null || dayWindowEnd > windowEnd) windowEnd = dayWindowEnd;
    }
    if (windowStart === null || windowEnd === null) return [];

    // Keep only slots whose instants fall inside the requested guest-day
    // interval. The legacy path (no guest tz) keeps the host-day slots.
    if (guestDayStartMs !== null && guestDayEndMs !== null) {
      const start = guestDayStartMs;
      const end = guestDayEndMs;
      slotStarts = slotStarts.filter((s) => s.getTime() >= start && s.getTime() < end);
      slotStarts.sort((a, b) => a.getTime() - b.getTime());
    }

    const events = await this.prisma.event.findMany({
      where: {
        userId: link.userId,
        recurrenceRule: null,
        startTime: { lt: windowEnd },
        endTime: { gt: windowStart },
      },
    });
    const recurringEvents = (await this.prisma.event.findMany({
      where: {
        userId: link.userId,
        recurrenceRule: { not: null },
        startTime: { lte: windowEnd },
      },
      take: 200,
    })) as Array<Record<string, unknown>>;
    const recurringService = new RecurringService(this.prisma as any);
    const expandedOccurrences = recurringEvents.flatMap((event) =>
      recurringService.expandOccurrences(this.toCalendarEvent(event), windowStart, windowEnd),
    );
    const busySlots = (events as Array<Record<string, unknown>>).map((event) => ({
      start: new Date(event['startTime'] as string | Date),
      end: new Date(event['endTime'] as string | Date),
    }));
    const slots: BookingSlot[] = [];
    // Never render already-started (or starting-within-buffer) slots as
    // bookable: the authoritative slots answer must agree with the booking
    // page, which maps `available` verbatim and only renders/selects
    // available slots. Server time is the source of truth.
    const bookableCutoff = Date.now() + BOOKING_SLOT_FUTURE_BUFFER_MS;
    for (const slotStart of slotStarts) {
      const slotEnd = new Date(slotStart.getTime() + slotDuration);
      const conflictsWithStandard = busySlots.some(
        (busy) => busy.start < slotEnd && busy.end > slotStart,
      );
      const conflictsWithRecurring = expandedOccurrences.some(
        (occurrence) => slotStart < occurrence.endTime && slotEnd > occurrence.startTime,
      );
      const isLocked = globalSlotLockStore.isSlotLocked(slug, link.userId, slotStart.getTime());
      const isPastOrTooSoon = slotStart.getTime() <= bookableCutoff;
      slots.push({
        start: slotStart,
        end: slotEnd,
        available: !conflictsWithStandard && !conflictsWithRecurring && !isLocked && !isPastOrTooSoon,
      });
    }
    return slots;
  }

  async confirmBooking(
    slug: string,
    slot: Date,
    bookerInfo: BookerInfo,
    lockId?: string,
  ): Promise<BookingConfirmationResult> {
    const link = await this.getBookingLink(slug);
    if (!link.isActive)
      throw createAppError('Booking link is inactive', 410, 'BOOKING_LINK_INACTIVE');
    const startTime = new Date(slot);
    if (Number.isNaN(startTime.getTime()))
      throw createAppError('Invalid booking slot', 400, 'INVALID_BOOKING_SLOT');
    const endTime = new Date(startTime.getTime() + link.duration * 60 * 1000);
    // Host-timezone day-boundary check (fix/qm-booking-tz-availability-2):
    // same anchor rule as lockSlot — the slot's host-local calendar day
    // must be an available day and the slot must sit inside the host-local
    // [startHour, endHour) window.
    const anchorTz = hostAnchorTimeZone(link);
    const { year, month, day } = zonedYmd(startTime, anchorTz);
    const dayStart = new Date(zonedWallTimeToUtcMs(year, month, day, link.startHour, 0, anchorTz));
    const dayEnd = new Date(zonedWallTimeToUtcMs(year, month, day, link.endHour, 0, anchorTz));
    const availableDays = (link.availableDays ?? [1, 2, 3, 4, 5]).map(Number);
    if (
      startTime.getTime() < Date.now() ||
      !availableDays.includes(zonedWeekday(year, month, day, anchorTz)) ||
      startTime.getTime() < dayStart.getTime() ||
      endTime.getTime() > dayEnd.getTime()
    ) {
      throw createAppError(
        'Requested slot is outside the booking link availability',
        400,
        'INVALID_BOOKING_SLOT',
      );
    }

    const normalizedEmail = bookerInfo.email.trim().toLowerCase();
    const activeLock = globalSlotLockStore.getActiveLock(slug, link.userId, startTime.getTime());
    if (activeLock) {
      if (activeLock.bookerEmail !== normalizedEmail) {
        throw createAppError('Slot is currently locked by another booker', 409, 'SLOT_UNAVAILABLE');
      }
      if (lockId && activeLock.lockId !== lockId) {
        throw createAppError('Slot is locked with a different lockId', 409, 'SLOT_UNAVAILABLE');
      }
    }

    const existingEvents = await this.prisma.event.findMany({
      where: {
        userId: link.userId,
        recurrenceRule: null,
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });
    if (existingEvents.length > 0)
      throw createAppError('Slot is no longer available', 409, 'SLOT_UNAVAILABLE');
    const recurringEvents = (await this.prisma.event.findMany({
      where: { userId: link.userId, recurrenceRule: { not: null }, startTime: { lte: dayEnd } },
      take: 200,
    })) as Array<Record<string, unknown>>;
    const recurringService = new RecurringService(this.prisma as any);
    const expandedOccurrences = recurringEvents.flatMap((event) =>
      recurringService.expandOccurrences(this.toCalendarEvent(event), dayStart, dayEnd),
    );
    if (
      expandedOccurrences.some(
        (occurrence) => startTime < occurrence.endTime && endTime > occurrence.startTime,
      )
    ) {
      throw createAppError('Selected slot is no longer available', 409, 'SLOT_UNAVAILABLE');
    }

    const now = new Date();
    const createdEvent = await this.prisma.event.create({
      data: {
        title: `${link.title} with ${bookerInfo.name}`,
        description: bookerInfo.notes ?? '',
        startTime,
        endTime,
        allDay: false,
        location: '',
        userId: link.userId,
        attendees: JSON.stringify([
          { userId: '', email: bookerInfo.email, name: bookerInfo.name, status: 'accepted' },
        ]),
        recurrenceRule: null,
        status: 'confirmed',
        reminders: JSON.stringify([{ type: 'email', minutesBefore: 15 }]),
        createdAt: now,
        updatedAt: now,
      },
    });

    if (activeLock) {
      globalSlotLockStore.removeLock(activeLock.lockId);
    }
    if (lockId) {
      globalSlotLockStore.removeLock(lockId);
    }

    let hostEmail = '';
    let hostName = 'Unknown host';
    const resolvedHost = await this.resolveHost(link.userId);
    if (resolvedHost) {
      hostEmail = resolvedHost.hostEmail;
      hostName = resolvedHost.hostName;
    }

    const eventRecord = createdEvent as Record<string, unknown>;
    const eventId = String(eventRecord?.['id'] ?? randomUUID());
    const uid = `${eventId}@quantmail.in`;

    const icsContent = generateIcsInvite({
      uid,
      summary: `${link.title} with ${bookerInfo.name}`,
      description: bookerInfo.notes ?? '',
      startTime,
      endTime,
      organizer: { name: hostName, email: hostEmail },
      attendee: { name: bookerInfo.name, email: bookerInfo.email },
      status: 'CONFIRMED',
    });

    return {
      event: createdEvent,
      icsContent,
      hostName: resolvedHost?.hostName ?? null,
      hostEmail: resolvedHost?.hostEmail ?? null,
    };
  }

  async listBookings(userId: string): Promise<BookingLink[]> {
    const links = await this.prisma.bookingLink.findMany({ where: { userId } });
    return links.map((link) => this.toBookingLink(link));
  }

  private parseArray(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private toCalendarEvent(raw: Record<string, unknown>): CalendarEvent {
    return {
      id: String(raw['id']),
      title: String(raw['title']),
      description: String(raw['description'] ?? ''),
      startTime: new Date(raw['startTime'] as string | Date),
      endTime: new Date(raw['endTime'] as string | Date),
      allDay: Boolean(raw['allDay']),
      location: String(raw['location'] ?? ''),
      userId: String(raw['userId']),
      attendees: this.parseArray(raw['attendees']),
      recurrenceRule: (raw['recurrenceRule'] as string | null) ?? null,
      status: (raw['status'] as CalendarEvent['status']) ?? 'confirmed',
      reminders: this.parseArray(raw['reminders']),
      createdAt: new Date(raw['createdAt'] as string | Date),
      updatedAt: new Date(raw['updatedAt'] as string | Date),
    };
  }

  private toBookingLink(raw: unknown): BookingLink {
    const record = raw as Record<string, unknown>;
    const title = record['title'] as string;
    return {
      id: record['id'] as string,
      userId: record['userId'] as string,
      slug: record['slug'] as string,
      title,
      hostTitle: title,
      description: (record['description'] as string) ?? '',
      duration: record['duration'] as number,
      availableDays:
        typeof record['availableDays'] === 'string'
          ? JSON.parse(record['availableDays'] as string)
          : ((record['availableDays'] as number[]) ?? [1, 2, 3, 4, 5]),
      startHour: (record['startHour'] as number) ?? 9,
      endHour: (record['endHour'] as number) ?? 17,
      timezone: hostAnchorTimeZone(record),
      isActive: (record['isActive'] as boolean) ?? true,
      createdAt: new Date(record['createdAt'] as string | Date),
      updatedAt: new Date(record['updatedAt'] as string | Date),
      // Identity is resolved asynchronously per-caller (see getBookingLink /
      // confirmBooking); raw records carry no host info.
      hostName: null,
      hostEmail: null,
    };
  }
}
