import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { CalendarService } from '../services/calendar.service';
import { AlarmService, type AlarmEvent } from '../services/alarm.service';
import { BookingLinkService } from '../services/booking-link.service';
import { RecurringService, type CalendarEvent } from '../services/recurring.service';
import { CalendarCallAlertService } from '../services/calendar-call-alert.service';

const MAX_EVENT_WINDOW_MS = 365 * 86_400_000;

function getPrisma(fastify: FastifyInstance): any {
  return (fastify as unknown as { prisma: unknown }).prisma;
}
function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  return userId;
}
function parentEventId(id: string): string {
  return id.includes('_') ? id.split('_')[0]! : id;
}

const attendeeInput = z.union([
  z.string().max(320),
  z.object({ email: z.string().max(320).optional() }).passthrough(),
]);
const reminderInput = z.union([
  z.string().max(120),
  z.number(),
  z.object({ minutesBefore: z.number().optional() }).passthrough(),
]);
const eventCollectionFields = {
  attendees: z.array(attendeeInput).max(200).optional(),
  reminders: z.array(reminderInput).max(50).optional(),
  recurrence: z.string().max(200).nullable().optional(),
  recurrenceRule: z.string().max(200).nullable().optional(),
  calendarId: z.string().optional(),
  timeZone: z.string().max(100).optional(),
  timezone: z.string().max(100).optional(),
};
const eventCreateSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  start: z.string(),
  end: z.string().optional(),
  allDay: z.boolean().optional(),
  location: z.string().max(500).optional(),
  checkConflicts: z.boolean().optional(),
  force: z.boolean().optional(),
  ...eventCollectionFields,
});
const eventUpdateSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  allDay: z.boolean().optional(),
  location: z.string().max(500).optional(),
  status: z.enum(['confirmed', 'tentative', 'cancelled']).optional(),
  checkConflicts: z.boolean().optional(),
  force: z.boolean().optional(),
  scope: z.string().optional(),
  ...eventCollectionFields,
});
const calendarCreateSchema = z.object({
  name: z.string().min(1).max(200),
  color: z.string().max(32).optional(),
});
const calendarUpdateSchema = z
  .object({ name: z.string().min(1).max(200).optional(), color: z.string().max(32).optional() })
  .refine((value) => value.name !== undefined || value.color !== undefined, {
    message: 'At least one of name or color must be provided',
  });
const rsvpSchema = z.object({ status: z.enum(['accepted', 'declined', 'tentative', 'pending']) });
const bookingLinkSchema = z.object({
  slug: z.string().min(1).max(100),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  duration: z.number().int().min(5).max(480),
  availableDays: z.array(z.number().int().min(0).max(6)).optional(),
  startHour: z.number().int().min(0).max(23).optional(),
  endHour: z.number().int().min(1).max(24).optional(),
});
const confirmBookingSchema = z.object({
  slot: z.string(),
  name: z.string().min(1),
  email: z.string().email(),
  notes: z.string().optional(),
});

type AttendeeInput = z.infer<typeof attendeeInput>;
type ReminderInput = z.infer<typeof reminderInput>;
type StoredAttendee = { userId: string; email: string; name: string; status: string };
type StoredReminder = { type: string; minutesBefore: number | null; label: string };
type EventRow = {
  id: string;
  calendarId?: string | null;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  allDay: boolean;
  location: string;
  userId: string;
  status: string;
  attendees?: unknown;
  reminders?: unknown;
  recurrenceRule?: string | null;
  timeZone?: string | null;
  timezone?: string | null;
  createdAt: Date;
  updatedAt: Date;
};
const REMINDER_UNIT_MINUTES: Record<string, number> = {
  minute: 1,
  hour: 60,
  day: 1440,
  week: 10080,
};

function toDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw createAppError(`\`${field}\` is not a valid date`, 400, 'INVALID_DATE');
  return date;
}
function parseJsonArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function minutesFromLabel(label: string): number | null {
  const match = /^(\d+)\s+(minute|hour|day|week)s?\s+before/i.exec(label.trim());
  if (match) return Number(match[1]) * REMINDER_UNIT_MINUTES[match[2]!.toLowerCase()]!;
  if (/^on the day/i.test(label.trim())) return 0;
  return null;
}
function labelFromMinutes(minutes: number): string {
  if (minutes <= 0) return 'On the day';
  for (const unit of ['week', 'day', 'hour'] as const) {
    const size = REMINDER_UNIT_MINUTES[unit]!;
    if (minutes % size === 0) {
      const count = minutes / size;
      return `${count} ${unit}${count === 1 ? '' : 's'} before`;
    }
  }
  return `${minutes} minute${minutes === 1 ? '' : 's'} before`;
}
function toStoredAttendees(input: AttendeeInput[]): StoredAttendee[] {
  const seen = new Set<string>();
  const result: StoredAttendee[] = [];
  for (const entry of input) {
    const source = typeof entry === 'string' ? { email: entry } : entry;
    const email = String(source.email ?? '').trim();
    if (!email || seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    result.push({
      userId: typeof source['userId'] === 'string' ? source['userId'] : '',
      email,
      name: typeof source['name'] === 'string' ? source['name'] : '',
      status: typeof source['status'] === 'string' ? source['status'] : 'pending',
    });
  }
  return result;
}
function toStoredReminders(input: ReminderInput[]): StoredReminder[] {
  const result: StoredReminder[] = [];
  for (const entry of input) {
    if (typeof entry === 'string') {
      const label = entry.trim();
      if (label) result.push({ type: 'push', minutesBefore: minutesFromLabel(label), label });
      continue;
    }
    if (typeof entry === 'number') {
      if (Number.isFinite(entry))
        result.push({ type: 'push', minutesBefore: entry, label: labelFromMinutes(entry) });
      continue;
    }
    const type = typeof entry['type'] === 'string' ? entry['type'] : 'push';
    const label = typeof entry['label'] === 'string' ? entry['label'].trim() : '';
    const minutes = Number(entry.minutesBefore);
    if (Number.isFinite(minutes))
      result.push({ type, minutesBefore: minutes, label: label || labelFromMinutes(minutes) });
    else if (label) result.push({ type, minutesBefore: minutesFromLabel(label), label });
  }
  return result;
}
function attendeeEmails(raw: unknown): string[] {
  return parseJsonArray(raw)
    .map((entry) =>
      typeof entry === 'string' ? entry : String((entry as { email?: unknown })?.email ?? ''),
    )
    .filter(Boolean);
}
function reminderLabels(raw: unknown): string[] {
  return parseJsonArray(raw)
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (typeof entry === 'number') return labelFromMinutes(entry);
      const reminder = entry as { label?: unknown; minutesBefore?: unknown };
      if (typeof reminder?.label === 'string' && reminder.label) return reminder.label;
      const minutes = Number(reminder?.minutesBefore);
      return Number.isFinite(minutes) ? labelFromMinutes(minutes) : '';
    })
    .filter(Boolean);
}
function alarmReminders(raw: unknown): AlarmEvent['reminders'] {
  return parseJsonArray(raw).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const reminder = entry as { type?: unknown; minutesBefore?: unknown };
    const minutesBefore = Number(reminder.minutesBefore);
    return typeof reminder.type === 'string' && Number.isFinite(minutesBefore)
      ? [{ type: reminder.type, minutesBefore }]
      : [];
  });
}
function normalizeRecurrenceRule(
  value: string | null | undefined,
  recurringService: RecurringService,
): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '' || /^(none|does not repeat)$/i.test(trimmed)) return null;
  try {
    recurringService.parseRRule(trimmed);
  } catch {
    throw createAppError('Invalid recurrence rule: malformed RRULE string', 400, 'INVALID_RRULE');
  }
  return trimmed;
}
function pickRecurrence(data: {
  recurrence?: string | null;
  recurrenceRule?: string | null;
}): string | null | undefined {
  return data.recurrence !== undefined ? data.recurrence : data.recurrenceRule;
}
function toCalendarEvent(row: EventRow): CalendarEvent {
  return {
    id: row.id,
    calendarId: row.calendarId ?? null,
    title: row.title,
    description: row.description ?? '',
    startTime: new Date(row.startTime),
    endTime: new Date(row.endTime),
    allDay: row.allDay ?? false,
    location: row.location ?? '',
    userId: row.userId,
    attendees: parseJsonArray(row.attendees),
    recurrenceRule: row.recurrenceRule ?? null,
    status: row.status as CalendarEvent['status'],
    reminders: parseJsonArray(row.reminders),
    timeZone: (row as any).timeZone || (row as any).timezone || 'UTC',
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}
function toEventDto(event: EventRow | CalendarEvent) {
  return {
    id: event.id,
    parentId:
      (event as CalendarEvent).parentId ??
      (event.id.includes('_') ? event.id.split('_')[0] : event.id),
    calendarId: (event as EventRow).calendarId ?? (event as CalendarEvent).calendarId ?? null,
    title: event.title,
    description: event.description,
    startTime: event.startTime,
    endTime: event.endTime,
    allDay: event.allDay,
    location: event.location,
    status: event.status,
    timeZone: (event as any).timeZone || (event as any).timezone || 'UTC',
    attendees: parseJsonArray(event.attendees)
      .map((a: any) =>
        typeof a === 'string'
          ? { email: a.trim(), name: '', status: 'pending' }
          : { email: (a.email || '').trim(), name: a.name || '', status: a.status || 'pending' },
      )
      .filter((a) => Boolean(a.email)),
    reminders: reminderLabels(event.reminders),
    recurrence: event.recurrenceRule ?? null,
  };
}
function formatIcsDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}
function escapeIcs(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}
function safeFileName(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9_-]/gi, '_')
      .replace(/_+/g, '_')
      .slice(0, 50) || 'event'
  );
}

interface IcsOptions {
  method?: 'PUBLISH' | 'REQUEST' | 'CANCEL';
  sequence?: number;
  organizer?: { name?: string; email: string };
}

function buildIcsContent(event: EventRow, options: IcsOptions = {}): string {
  const method = options.method ?? 'PUBLISH';
  const sequence = options.sequence ?? (method === 'CANCEL' ? 1 : 0);
  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Quant Ecosystem//QuantCalendar//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${event.id}@quantmail.in`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(new Date(event.startTime))}`,
    `DTEND:${formatIcsDate(new Date(event.endTime))}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `DESCRIPTION:${escapeIcs(event.description || '')}`,
    `LOCATION:${escapeIcs(event.location || '')}`,
    `STATUS:${method === 'CANCEL' ? 'CANCELLED' : (event.status || 'confirmed').toUpperCase()}`,
    `SEQUENCE:${sequence}`,
  ];

  if (options.organizer?.email) {
    const cn = escapeIcs(
      options.organizer.name || options.organizer.email.split('@')[0] || 'Organizer',
    );
    icsLines.push(`ORGANIZER;CN=${cn}:mailto:${options.organizer.email}`);
  }

  if (method === 'REQUEST' || method === 'CANCEL') {
    const attendees = parseJsonArray(event.attendees);
    for (const raw of attendees) {
      const entry = raw as any;
      const email =
        typeof entry === 'string'
          ? entry.trim()
          : typeof entry?.email === 'string'
            ? entry.email.trim()
            : '';
      if (!email) continue;
      const name =
        typeof entry === 'object' && entry && typeof entry.name === 'string' && entry.name
          ? escapeIcs(entry.name)
          : email;
      const status =
        typeof entry === 'object' && entry && entry.status
          ? String(entry.status).toUpperCase()
          : 'NEEDS-ACTION';
      icsLines.push(
        `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=${status};RSVP=TRUE;CN=${name}:mailto:${email}`,
      );
    }
  }

  if (event.recurrenceRule) {
    icsLines.push(`RRULE:${event.recurrenceRule}`);
  }

  icsLines.push('END:VEVENT', 'END:VCALENDAR');
  return icsLines.join('\r\n') + '\r\n';
}

function unescapeIcs(value: string): string {
  return value.replace(/\\([nN;,\\"])/g, (_, match) => {
    if (match === 'n' || match === 'N') return '\n';
    return match;
  });
}

function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  tz: string,
): Date {
  let validTz = 'UTC';
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    validTz = tz;
  } catch {
    validTz = 'UTC';
  }

  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (validTz === 'UTC') return guess;

  const tzFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: validTz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });

  for (let iter = 0; iter < 4; iter++) {
    const parts = tzFormatter.formatToParts(guess);
    const gy = Number(parts.find((p) => p.type === 'year')?.value);
    const gm = Number(parts.find((p) => p.type === 'month')?.value);
    const gd = Number(parts.find((p) => p.type === 'day')?.value);
    let gh = Number(parts.find((p) => p.type === 'hour')?.value);
    if (gh === 24) gh = 0;
    const gmin = Number(parts.find((p) => p.type === 'minute')?.value);
    const gs = Number(parts.find((p) => p.type === 'second')?.value);

    const targetMs = Date.UTC(year, month - 1, day, hour, minute, second);
    const currentMs = Date.UTC(gy, gm - 1, gd, gh, gmin, gs);
    const diff = targetMs - currentMs;
    if (diff === 0) break;
    guess = new Date(guess.getTime() + diff);
  }
  return guess;
}

function parseIcsDateTime(
  rawVal: string,
  paramsStr = '',
): { date: Date; allDay: boolean; tz?: string } {
  const cleanVal = rawVal.trim();
  let tzid: string | undefined;
  const tzidMatch = /TZID=([^;:]+)/i.exec(paramsStr);
  if (tzidMatch) {
    tzid = tzidMatch[1]!.replace(/^["']|["']$/g, '').trim();
    if (tzid.startsWith('/')) tzid = tzid.substring(1);
  }

  const isDateOnly =
    /VALUE=DATE(?![A-Z])/i.test(paramsStr) ||
    /^\d{8}$/.test(cleanVal) ||
    /^\d{4}-\d{2}-\d{2}$/.test(cleanVal);

  if (isDateOnly) {
    const digits = cleanVal.replace(/-/g, '');
    const year = Number(digits.substring(0, 4));
    const month = Number(digits.substring(4, 6));
    const day = Number(digits.substring(6, 8));
    return {
      date: new Date(Date.UTC(year, month - 1, day, 0, 0, 0)),
      allDay: true,
      tz: tzid,
    };
  }

  if (cleanVal.includes('-') && cleanVal.includes(':')) {
    const d = new Date(cleanVal);
    if (!Number.isNaN(d.getTime())) {
      return { date: d, allDay: false, tz: tzid };
    }
  }

  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/i.exec(cleanVal);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const min = Number(match[5]);
    const sec = Number(match[6]);
    const isUtc = Boolean(match[7]);

    if (isUtc || !tzid) {
      return {
        date: new Date(Date.UTC(year, month - 1, day, hour, min, sec)),
        allDay: false,
        tz: isUtc ? 'UTC' : undefined,
      };
    }

    return {
      date: zonedTimeToUtc(year, month, day, hour, min, sec, tzid),
      allDay: false,
      tz: tzid,
    };
  }

  const fallback = new Date(cleanVal);
  if (!Number.isNaN(fallback.getTime())) {
    return { date: fallback, allDay: false, tz: tzid };
  }

  throw new Error(`Invalid ICS date format: ${cleanVal}`);
}

function parseIcsDuration(durationStr: string): number {
  const match = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(
    durationStr.trim(),
  );
  if (!match) return 3_600_000;
  const sign = match[1] === '-' ? -1 : 1;
  const weeks = Number(match[2] || 0);
  const days = Number(match[3] || 0);
  const hours = Number(match[4] || 0);
  const minutes = Number(match[5] || 0);
  const seconds = Number(match[6] || 0);

  const totalMs =
    weeks * 7 * 86_400_000 +
    days * 86_400_000 +
    hours * 3_600_000 +
    minutes * 60_000 +
    seconds * 1_000;

  return sign * (totalMs > 0 ? totalMs : 3_600_000);
}

function normalizeUid(uid?: string): string | undefined {
  if (!uid) return undefined;
  const trimmed = uid.trim();
  if (!trimmed) return undefined;
  if (trimmed.endsWith('@quantmail.in')) {
    return trimmed.slice(0, -'@quantmail.in'.length);
  }
  return trimmed;
}

interface ParsedIcsEvent {
  uid?: string;
  title: string;
  description: string;
  location: string;
  startTime: Date;
  endTime: Date;
  allDay: boolean;
  recurrenceRule: string | null;
  status: 'confirmed' | 'tentative' | 'cancelled';
  timeZone?: string;
}

function parseIcsContent(icsContent: string, recurringService: RecurringService): ParsedIcsEvent[] {
  const unfolded = icsContent.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);
  const veventBlocks: string[][] = [];
  let currentBlock: string[] | null = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (/^BEGIN:VEVENT$/i.test(trimmed)) {
      currentBlock = [];
    } else if (/^END:VEVENT$/i.test(trimmed)) {
      if (currentBlock) {
        veventBlocks.push(currentBlock);
        currentBlock = null;
      }
    } else if (currentBlock) {
      currentBlock.push(rawLine);
    }
  }

  if (veventBlocks.length === 0) {
    throw createAppError('Malformed ICS: No VEVENT blocks found', 400, 'VALIDATION_ERROR');
  }

  const parsedEvents: ParsedIcsEvent[] = [];

  for (const block of veventBlocks) {
    let uid: string | undefined;
    let summary: string | undefined;
    let description = '';
    let location = '';
    let status: 'confirmed' | 'tentative' | 'cancelled' = 'confirmed';
    let dtStartRaw: string | undefined;
    let dtStartParams = '';
    let dtEndRaw: string | undefined;
    let dtEndParams = '';
    let durationRaw: string | undefined;
    let rruleRaw: string | undefined;
    const exDates: string[] = [];

    for (const line of block) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const rawHeader = line.substring(0, colonIdx).trim();
      const rawValue = line.substring(colonIdx + 1);

      const semiIdx = rawHeader.indexOf(';');
      const propName = (semiIdx === -1 ? rawHeader : rawHeader.substring(0, semiIdx))
        .toUpperCase()
        .trim();
      const propParams = semiIdx === -1 ? '' : rawHeader.substring(semiIdx + 1).trim();

      switch (propName) {
        case 'UID':
          uid = rawValue.trim();
          break;
        case 'SUMMARY':
          summary = unescapeIcs(rawValue.trim());
          break;
        case 'DESCRIPTION':
          description = unescapeIcs(rawValue.trim());
          break;
        case 'LOCATION':
          location = unescapeIcs(rawValue.trim());
          break;
        case 'STATUS': {
          const s = rawValue.trim().toLowerCase();
          if (s === 'confirmed' || s === 'tentative' || s === 'cancelled') {
            status = s;
          }
          break;
        }
        case 'DTSTART':
          dtStartRaw = rawValue.trim();
          dtStartParams = propParams;
          break;
        case 'DTEND':
          dtEndRaw = rawValue.trim();
          dtEndParams = propParams;
          break;
        case 'DURATION':
          durationRaw = rawValue.trim();
          break;
        case 'RRULE':
          rruleRaw = rawValue.trim();
          break;
        case 'EXDATE':
          exDates.push(rawValue.trim());
          break;
      }
    }

    if (!dtStartRaw) {
      continue;
    }

    let parsedStart: { date: Date; allDay: boolean; tz?: string };
    try {
      parsedStart = parseIcsDateTime(dtStartRaw, dtStartParams);
    } catch {
      continue;
    }

    const startTime = parsedStart.date;
    const allDay = parsedStart.allDay;
    const timeZone = parsedStart.tz;

    let endTime: Date;
    if (dtEndRaw) {
      try {
        endTime = parseIcsDateTime(dtEndRaw, dtEndParams).date;
      } catch {
        endTime = new Date(startTime.getTime() + (allDay ? 86_400_000 : 3_600_000));
      }
    } else if (durationRaw) {
      const durMs = parseIcsDuration(durationRaw);
      endTime = new Date(startTime.getTime() + durMs);
    } else {
      endTime = new Date(startTime.getTime() + (allDay ? 86_400_000 : 3_600_000));
    }

    if (endTime <= startTime) {
      endTime = new Date(startTime.getTime() + (allDay ? 86_400_000 : 3_600_000));
    }

    let normalizedRRule: string | null = null;
    if (rruleRaw) {
      let fullRule = rruleRaw;
      if (exDates.length > 0 && !fullRule.includes('EXDATE=')) {
        fullRule += `;EXDATE=${exDates.join(',')}`;
      }
      try {
        normalizedRRule = normalizeRecurrenceRule(fullRule, recurringService);
      } catch {
        normalizedRRule = null;
      }
    }

    parsedEvents.push({
      uid,
      title: summary || 'Untitled Event',
      description,
      location,
      startTime,
      endTime,
      allDay,
      recurrenceRule: normalizedRRule,
      status,
      timeZone,
    });
  }

  if (parsedEvents.length === 0) {
    throw createAppError(
      'Malformed ICS: No valid VEVENT entries could be parsed',
      400,
      'VALIDATION_ERROR',
    );
  }

  return parsedEvents;
}

interface ConflictResult {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
}

async function findEventConflicts(
  prisma: any,
  recurringService: RecurringService,
  userId: string,
  start: Date,
  end: Date,
  excludeIds: string[] = [],
): Promise<ConflictResult[]> {
  const excludeSet = new Set(excludeIds.filter(Boolean));

  // 1. Non-recurring events
  const nonRecurring = (await prisma.event.findMany({
    where: {
      userId,
      recurrenceRule: null,
      status: { not: 'cancelled' },
      startTime: { lt: end },
      endTime: { gt: start },
    },
    select: { id: true, title: true, startTime: true, endTime: true },
  })) as Array<{ id: string; title: string; startTime: Date; endTime: Date }>;

  const conflicts: ConflictResult[] = nonRecurring
    .filter((e) => !excludeSet.has(e.id) && !excludeSet.has(parentEventId(e.id)))
    .map((e) => ({
      id: e.id,
      title: e.title,
      startTime: new Date(e.startTime),
      endTime: new Date(e.endTime),
    }));

  // 2. Recurring events within the window
  const recurringRows = (await prisma.event.findMany({
    where: {
      userId,
      recurrenceRule: { not: null },
      status: { not: 'cancelled' },
      startTime: { lte: end },
    },
  })) as EventRow[];

  for (const row of recurringRows) {
    if (excludeSet.has(row.id)) continue;
    try {
      const occurrences = recurringService.expandOccurrences(toCalendarEvent(row), start, end);
      for (const occ of occurrences) {
        if (excludeSet.has(occ.id) || excludeSet.has(parentEventId(occ.id))) continue;
        if (occ.status === 'cancelled') continue;
        if (occ.startTime < end && occ.endTime > start) {
          conflicts.push({
            id: occ.id,
            title: occ.title,
            startTime: new Date(occ.startTime),
            endTime: new Date(occ.endTime),
          });
        }
      }
    } catch {
      // Skip on expansion failure
    }
  }

  return conflicts;
}
function getTodayWindow(timeZoneInput?: string): { startOfDay: Date; endOfDay: Date } {
  let tz = 'UTC';
  if (timeZoneInput && typeof timeZoneInput === 'string' && timeZoneInput.trim()) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timeZoneInput.trim() });
      tz = timeZoneInput.trim();
    } catch {
      tz = 'UTC';
    }
  }

  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);

  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);

  const getInstant = (h: number, m: number, s: number, ms: number): Date => {
    let guess = new Date(Date.UTC(year, month - 1, day, h, m, s, ms));
    const tzFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      fractionalSecondDigits: 3,
      hour12: false,
    });
    for (let iter = 0; iter < 3; iter++) {
      const p = tzFormatter.formatToParts(guess);
      const gy = Number(p.find((x) => x.type === 'year')?.value);
      const gm = Number(p.find((x) => x.type === 'month')?.value);
      const gd = Number(p.find((x) => x.type === 'day')?.value);
      let gh = Number(p.find((x) => x.type === 'hour')?.value);
      if (gh === 24) gh = 0;
      const gmin = Number(p.find((x) => x.type === 'minute')?.value);
      const gs = Number(p.find((x) => x.type === 'second')?.value);
      const gms = Number(p.find((x) => x.type === 'fractionalSecond')?.value ?? 0);

      const targetMs = Date.UTC(year, month - 1, day, h, m, s, ms);
      const currentMs = Date.UTC(gy, gm - 1, gd, gh, gmin, gs, gms);
      const diff = targetMs - currentMs;
      if (diff === 0) break;
      guess = new Date(guess.getTime() + diff);
    }
    return guess;
  };

  const startOfDay = getInstant(0, 0, 0, 0);
  const endOfDay = getInstant(23, 59, 59, 999);
  return { startOfDay, endOfDay };
}

export default async function calendarRoutes(
  fastify: FastifyInstance,
  options?: { callAlertService?: CalendarCallAlertService },
) {
  const calendarService = () => new CalendarService(getPrisma(fastify));
  const bookingService = () => new BookingLinkService(getPrisma(fastify));
  const recurringService = new RecurringService(getPrisma(fastify));
  const callAlertService = options?.callAlertService ?? new CalendarCallAlertService();

  if (!fastify.hasContentTypeParser('text/calendar')) {
    fastify.addContentTypeParser(
      'text/calendar',
      { parseAs: 'string' },
      (_request, body: string, done) => {
        done(null, body);
      },
    );
  }
  if (!fastify.hasContentTypeParser('text/plain')) {
    fastify.addContentTypeParser(
      'text/plain',
      { parseAs: 'string' },
      (_request, body: string, done) => {
        done(null, body);
      },
    );
  }

  fastify.get('/calendars', async (request, reply) =>
    reply.send({
      success: true,
      data: await calendarService().listCalendars(requireUserId(request)),
    }),
  );
  fastify.post('/calendars', async (request, reply) => {
    const parsed = calendarCreateSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    return reply.status(201).send({
      success: true,
      data: await calendarService().createCalendar(requireUserId(request), parsed.data),
    });
  });
  fastify.put<{ Params: { id: string } }>('/calendars/:id', async (request, reply) => {
    const parsed = calendarUpdateSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    return reply.send({
      success: true,
      data: await calendarService().updateCalendar(
        requireUserId(request),
        request.params.id,
        parsed.data,
      ),
    });
  });
  fastify.delete<{ Params: { id: string } }>('/calendars/:id', async (request, reply) =>
    reply.send({
      success: true,
      data: await calendarService().deleteCalendar(requireUserId(request), request.params.id),
    }),
  );
  fastify.post<{ Params: { id: string } }>('/calendars/:id/primary', async (request, reply) =>
    reply.send({
      success: true,
      data: await calendarService().setPrimary(requireUserId(request), request.params.id),
    }),
  );

  fastify.get<{
    Querystring: {
      start?: string;
      end?: string;
      calendarId?: string;
      cursor?: string;
      limit?: string | number;
    };
  }>('/events', async (request, reply) => {
    const userId = requireUserId(request);
    const { start, end, calendarId, cursor } = request.query;
    if (start && end && !cursor && request.query.limit === undefined) {
      const startDate = toDate(start, 'start');
      const requestedEnd = toDate(end, 'end');
      if (requestedEnd < startDate)
        throw createAppError('`end` cannot be before `start`', 400, 'INVALID_RANGE');
      if (requestedEnd.getTime() - startDate.getTime() > MAX_EVENT_WINDOW_MS) {
        throw createAppError('Event query window cannot exceed 365 days', 400, 'WINDOW_TOO_LARGE');
      }
      const endDate = requestedEnd;
      const rows = (await getPrisma(fastify).event.findMany({
        where: {
          userId,
          recurrenceRule: null,
          startTime: { gte: startDate, lte: endDate },
          ...(calendarId ? { calendarId } : {}),
        },
        orderBy: { startTime: 'asc' },
        take: 1000,
      })) as EventRow[];
      const recurringRows = (await getPrisma(fastify).event.findMany({
        where: {
          userId,
          recurrenceRule: { not: null },
          startTime: { lte: endDate },
          ...(calendarId ? { calendarId } : {}),
        },
        take: 200,
      })) as EventRow[];
      const expandedDtos = recurringRows.flatMap((row) => {
        try {
          return recurringService
            .expandOccurrences(toCalendarEvent(row), startDate, endDate)
            .filter(
              (occurrence) => occurrence.startTime <= endDate && occurrence.endTime >= startDate,
            )
            .map(toEventDto);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn(`Unable to expand recurring calendar event ${row.id}`, error);
          return [];
        }
      });
      const merged = [...rows.map(toEventDto), ...expandedDtos];
      const data = [...new Map(merged.map((event) => [event.id, event])).values()].sort(
        (left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime(),
      );
      return reply.send({ success: true, data });
    }

    const limit = Math.min(250, Math.max(1, Number(request.query.limit) || 50));
    const prisma = getPrisma(fastify);
    const where: Record<string, unknown> = { userId };
    if (calendarId) where.calendarId = calendarId;
    if (start || end)
      where.startTime = {
        ...(start ? { gte: toDate(start, 'start') } : {}),
        ...(end ? { lte: toDate(end, 'end') } : {}),
      };

    const queryArgs: Record<string, unknown> = {
      where,
      orderBy: { startTime: 'asc' },
      take: limit + 1,
    };
    if (cursor) {
      queryArgs.cursor = { id: cursor };
      queryArgs.skip = 1;
    }

    const rawRows = (await prisma.event.findMany(queryArgs)) as EventRow[];
    const hasMore = rawRows.length > limit;
    const items = hasMore ? rawRows.slice(0, limit) : rawRows;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1]!.id : null;

    let totalCount: number;
    if (typeof prisma.event.count === 'function') {
      totalCount = await prisma.event.count({
        where: { userId, ...(calendarId ? { calendarId } : {}) },
      });
    } else {
      totalCount = items.length;
    }

    return reply.send({
      success: true,
      data: items.map(toEventDto),
      nextCursor,
      hasMore,
      totalCount,
    });
  });

  fastify.get<{
    Querystring: {
      start?: string;
      end?: string;
      startTime?: string;
      endTime?: string;
      calendarId?: string;
    };
  }>('/events/free-busy', async (request, reply) => {
    const userId = requireUserId(request);
    const startStr = request.query.start || request.query.startTime;
    const endStr = request.query.end || request.query.endTime;
    if (!startStr || !endStr) {
      throw createAppError('Both start and end times are required', 400, 'MISSING_TIME_RANGE');
    }
    const startDate = toDate(startStr, 'start');
    const endDate = toDate(endStr, 'end');
    if (endDate < startDate) {
      throw createAppError('`end` cannot be before `start`', 400, 'INVALID_RANGE');
    }
    if (endDate.getTime() - startDate.getTime() > MAX_EVENT_WINDOW_MS) {
      throw createAppError('Event query window cannot exceed 365 days', 400, 'WINDOW_TOO_LARGE');
    }

    const calendarId = request.query.calendarId;
    const prisma = getPrisma(fastify);

    const nonRecurring = (await prisma.event.findMany({
      where: {
        userId,
        recurrenceRule: null,
        status: { not: 'cancelled' },
        startTime: { lt: endDate },
        endTime: { gt: startDate },
        ...(calendarId ? { calendarId } : {}),
      },
      select: { id: true, title: true, startTime: true, endTime: true },
    })) as Array<{ id: string; title: string; startTime: Date; endTime: Date }>;

    const recurringRows = (await prisma.event.findMany({
      where: {
        userId,
        recurrenceRule: { not: null },
        status: { not: 'cancelled' },
        startTime: { lte: endDate },
        ...(calendarId ? { calendarId } : {}),
      },
    })) as EventRow[];

    const recurringOccurrences: Array<{ start: Date; end: Date; eventId: string; title: string }> =
      [];
    for (const row of recurringRows) {
      try {
        const occs = recurringService.expandOccurrences(toCalendarEvent(row), startDate, endDate);
        for (const occ of occs) {
          if (occ.status === 'cancelled') continue;
          if (occ.startTime < endDate && occ.endTime > startDate) {
            recurringOccurrences.push({
              start: new Date(Math.max(occ.startTime.getTime(), startDate.getTime())),
              end: new Date(Math.min(occ.endTime.getTime(), endDate.getTime())),
              eventId: occ.id,
              title: occ.title,
            });
          }
        }
      } catch {
        // Skip on expansion failure
      }
    }

    const rawIntervals = [
      ...nonRecurring.map((e) => ({
        start: new Date(Math.max(new Date(e.startTime).getTime(), startDate.getTime())),
        end: new Date(Math.min(new Date(e.endTime).getTime(), endDate.getTime())),
        eventId: e.id,
        title: e.title,
      })),
      ...recurringOccurrences,
    ].sort((a, b) => a.start.getTime() - b.start.getTime());

    const busy: Array<{ start: Date; end: Date }> = [];
    for (const item of rawIntervals) {
      if (busy.length === 0) {
        busy.push({ start: item.start, end: item.end });
      } else {
        const prev = busy[busy.length - 1];
        if (item.start.getTime() <= prev.end.getTime()) {
          if (item.end.getTime() > prev.end.getTime()) {
            prev.end = item.end;
          }
        } else {
          busy.push({ start: item.start, end: item.end });
        }
      }
    }

    return reply.send({
      success: true,
      data: {
        timeRange: { start: startDate, end: endDate },
        busy,
        conflictsCount: rawIntervals.length,
        busyBlocksCount: busy.length,
      },
    });
  });
  fastify.get<{
    Querystring: { timeZone?: string; timezone?: string; calendarId?: string };
  }>('/events/today', async (request, reply) => {
    const userId = requireUserId(request);
    const tzParam = request.query.timeZone ?? request.query.timezone;
    const tzHeader = request.headers['x-timezone'] as string | undefined;
    const requestedTz = (tzParam || tzHeader || 'UTC').trim();
    const { startOfDay, endOfDay } = getTodayWindow(requestedTz);
    const calendarId = request.query.calendarId;

    const rows = (await getPrisma(fastify).event.findMany({
      where: {
        userId,
        recurrenceRule: null,
        startTime: { gte: startOfDay, lte: endOfDay },
        ...(calendarId ? { calendarId } : {}),
      },
      orderBy: { startTime: 'asc' },
      take: 500,
    })) as EventRow[];

    const recurringRows = (await getPrisma(fastify).event.findMany({
      where: {
        userId,
        recurrenceRule: { not: null },
        startTime: { lte: endOfDay },
        ...(calendarId ? { calendarId } : {}),
      },
      take: 200,
    })) as EventRow[];

    const expandedDtos = recurringRows.flatMap((row) => {
      try {
        return recurringService
          .expandOccurrences(toCalendarEvent(row), startOfDay, endOfDay)
          .filter(
            (occurrence) => occurrence.startTime <= endOfDay && occurrence.endTime >= startOfDay,
          )
          .map(toEventDto);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(`Unable to expand recurring calendar event ${row.id}`, error);
        return [];
      }
    });

    const merged = [...rows.map(toEventDto), ...expandedDtos];
    const data = [...new Map(merged.map((event) => [event.id, event])).values()].sort(
      (left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime(),
    );
    return reply.send({ success: true, data });
  });
  fastify.get<{ Querystring: { limit?: string } }>('/events/upcoming', async (request, reply) => {
    const limit = Math.min(Math.max(Number(request.query.limit) || 10, 1), 100);
    const rows = (await getPrisma(fastify).event.findMany({
      where: { userId: requireUserId(request), startTime: { gte: new Date() } },
      orderBy: { startTime: 'asc' },
      take: limit,
    })) as EventRow[];
    return reply.send({ success: true, data: rows.map(toEventDto) });
  });
  fastify.get('/events/alarms/due', async (request, reply) => {
    const userId = requireUserId(request);
    const alarms = new AlarmService();
    const now = new Date();
    const { start, end } = alarms.fetchWindow(now);
    const rows = (await getPrisma(fastify).event.findMany({
      where: { userId, startTime: { lt: end }, endTime: { gt: start } },
      orderBy: { startTime: 'asc' },
    })) as EventRow[];
    const events: AlarmEvent[] = rows.map((event) => ({
      id: event.id,
      title: event.title,
      startTime: event.startTime,
      status: event.status,
      reminders: alarmReminders(event.reminders),
    }));
    return reply.send({ success: true, data: alarms.getDueCallAlarms(events, now) });
  });
  fastify.get('/events/alerts/scheduled', async (request, reply) => {
    return reply.send({
      success: true,
      data: callAlertService.getScheduledAlerts(requireUserId(request)),
    });
  });
  fastify.get<{ Params: { id: string } }>('/events/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const event = await getPrisma(fastify).event.findUnique({ where: { id: request.params.id } });
    if (!event || event.userId !== userId)
      throw createAppError('Event not found', 404, 'EVENT_NOT_FOUND');
    return reply.send({ success: true, data: toEventDto(event as EventRow) });
  });
  const getEventForIcs = async (prisma: any, id: string, userId: string): Promise<EventRow> => {
    let event = (await prisma.event.findUnique({
      where: { id },
    })) as EventRow | null;
    if (!event && id.includes('_')) {
      const parentId = id.split('_')[0]!;
      const occIso = id.split('_').slice(1).join('_');
      const parent = (await prisma.event.findUnique({
        where: { id: parentId },
      })) as EventRow | null;
      if (parent && parent.userId === userId) {
        const occStart = new Date(occIso);
        const duration = new Date(parent.endTime).getTime() - new Date(parent.startTime).getTime();
        event = {
          ...parent,
          id,
          startTime: occStart,
          endTime: new Date(occStart.getTime() + (duration > 0 ? duration : 3_600_000)),
          recurrenceRule: null,
        };
      }
    }
    if (!event || event.userId !== userId) {
      throw createAppError('Event not found', 404, 'EVENT_NOT_FOUND');
    }
    return event;
  };

  const getOrganizerInfo = async (prisma: any, userId: string) => {
    if (!prisma.user || typeof prisma.user.findUnique !== 'function') return undefined;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, email: true },
    });
    return user?.email ? { name: user.displayName || undefined, email: user.email } : undefined;
  };

  fastify.get<{ Params: { id: string } }>('/events/:id/ics', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const event = await getEventForIcs(prisma, request.params.id, userId);
    const icsString = buildIcsContent(event, { method: 'PUBLISH' });
    return reply
      .header('Content-Type', 'text/calendar; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${safeFileName(event.title)}.ics"`)
      .send(icsString);
  });

  fastify.get<{ Params: { id: string } }>('/events/:id/invite.ics', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const event = await getEventForIcs(prisma, request.params.id, userId);
    const organizer = await getOrganizerInfo(prisma, userId);
    const icsString = buildIcsContent(event, { method: 'REQUEST', organizer, sequence: 0 });
    return reply
      .header('Content-Type', 'text/calendar; charset=utf-8')
      .header(
        'Content-Disposition',
        `attachment; filename="${safeFileName(event.title)}_invite.ics"`,
      )
      .send(icsString);
  });

  fastify.get<{ Params: { id: string } }>('/events/:id/cancel.ics', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const event = await getEventForIcs(prisma, request.params.id, userId);
    const organizer = await getOrganizerInfo(prisma, userId);
    const icsString = buildIcsContent(event, { method: 'CANCEL', organizer, sequence: 1 });
    return reply
      .header('Content-Type', 'text/calendar; charset=utf-8')
      .header(
        'Content-Disposition',
        `attachment; filename="${safeFileName(event.title)}_cancel.ics"`,
      )
      .send(icsString);
  });

  fastify.post('/events', async (request, reply) => {
    const parsed = eventCreateSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const start = toDate(parsed.data.start, 'start');
    const end = parsed.data.end
      ? toDate(parsed.data.end, 'end')
      : new Date(start.getTime() + 3_600_000);
    if (end < start) throw createAppError('`end` cannot be before `start`', 400, 'INVALID_RANGE');
    const now = new Date();
    const recurrence = pickRecurrence(parsed.data);
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);

    if (parsed.data.checkConflicts && !parsed.data.force) {
      const conflicts = await findEventConflicts(prisma, recurringService, userId, start, end);
      if (conflicts.length > 0) {
        return reply.status(409).send({
          success: false,
          error: 'Event conflicts with existing event(s)',
          code: 'CONFLICT_DETECTED',
          conflicts,
        });
      }
    }

    let targetCalendarId = parsed.data.calendarId;
    if (!targetCalendarId && prisma.calendar) {
      if (typeof (prisma.calendar as any).findFirst === 'function') {
        const primaryCalendar = await prisma.calendar.findFirst({
          where: { userId, isPrimary: true },
          select: { id: true },
        });
        targetCalendarId = primaryCalendar?.id;
      } else if (typeof (prisma.calendar as any).findMany === 'function') {
        const calendars = await prisma.calendar.findMany({
          where: { userId },
        });
        targetCalendarId = (calendars.find((c: any) => c.isPrimary) ?? calendars[0])?.id;
      }
      if (!targetCalendarId && typeof (prisma.calendar as any).create === 'function') {
        const defaultCal = await prisma.calendar.create({
          data: {
            userId,
            name: 'Primary',
            color: '#3B82F6',
            isPrimary: true,
          },
          select: { id: true },
        });
        targetCalendarId = defaultCal?.id;
      }
    }

    const tzValue = parsed.data.timeZone ?? (parsed.data as any).timezone;
    const eventCreateData: Record<string, unknown> = {
      title: parsed.data.title,
      description: parsed.data.description ?? '',
      startTime: start,
      endTime: end,
      allDay: parsed.data.allDay ?? false,
      location: parsed.data.location ?? '',
      userId,
      calendarId: targetCalendarId,
      status: 'confirmed',
      attendees: JSON.stringify(toStoredAttendees(parsed.data.attendees ?? [])),
      reminders: JSON.stringify(toStoredReminders(parsed.data.reminders ?? [])),
      recurrenceRule: normalizeRecurrenceRule(recurrence, recurringService),
      createdAt: now,
      updatedAt: now,
    };
    if (tzValue) {
      eventCreateData.timeZone = tzValue;
    }

    let created: EventRow;
    try {
      created = (await prisma.event.create({
        data: eventCreateData,
      })) as EventRow;
    } catch (err: any) {
      if (
        tzValue &&
        (err?.message?.includes('Unknown argument') || err?.message?.includes('timeZone'))
      ) {
        delete eventCreateData.timeZone;
        created = (await prisma.event.create({
          data: eventCreateData,
        })) as EventRow;
        created.timeZone = tzValue;
      } else {
        throw err;
      }
    }
    if (tzValue && !created.timeZone) {
      created.timeZone = tzValue;
    }
    await callAlertService
      .scheduleAlertsForEvent({
        id: created.id,
        title: created.title,
        userId: created.userId,
        startTime: created.startTime,
        location: created.location,
        reminders: created.reminders as any,
      })
      .catch((err) => {
        request.log.warn({ err }, 'Failed to schedule event call alert');
      });
    return reply.status(201).send({ success: true, data: toEventDto(created) });
  });

  const handleIcsImport = async (request: any, reply: any) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);

    let icsData: string | undefined;
    let calendarId: string | undefined;

    if (typeof request.body === 'string') {
      icsData = request.body;
      calendarId = request.query?.calendarId;
    } else if (request.body && typeof request.body === 'object') {
      icsData = request.body.icsData;
      calendarId = request.body.calendarId || request.query?.calendarId;
    }

    if (typeof icsData !== 'string') {
      throw createAppError('ICS data must be provided as a string', 400, 'VALIDATION_ERROR');
    }

    if (!icsData.trim()) {
      throw createAppError('ICS payload cannot be empty', 400, 'VALIDATION_ERROR');
    }

    const MAX_ICS_SIZE = 5 * 1024 * 1024; // 5MB
    if (Buffer.byteLength(icsData, 'utf8') > MAX_ICS_SIZE) {
      throw createAppError('ICS payload exceeds 5MB size limit', 400, 'VALIDATION_ERROR');
    }

    const parsedEvents = parseIcsContent(icsData, recurringService);

    const MAX_ICS_EVENTS = 500;
    if (parsedEvents.length > MAX_ICS_EVENTS) {
      throw createAppError(
        `ICS payload contains ${parsedEvents.length} events, which exceeds the limit of ${MAX_ICS_EVENTS}`,
        400,
        'TOO_MANY_EVENTS',
      );
    }

    // Resolve target calendarId
    let targetCalendarId = calendarId;
    if (!targetCalendarId && prisma.calendar) {
      if (typeof (prisma.calendar as any).findFirst === 'function') {
        const primaryCalendar = await prisma.calendar.findFirst({
          where: { userId, isPrimary: true },
          select: { id: true },
        });
        targetCalendarId = primaryCalendar?.id;
      } else if (typeof (prisma.calendar as any).findMany === 'function') {
        const calendars = await prisma.calendar.findMany({
          where: { userId },
        });
        targetCalendarId = (calendars.find((c: any) => c.isPrimary) ?? calendars[0])?.id;
      }
      if (!targetCalendarId && typeof (prisma.calendar as any).create === 'function') {
        const defaultCal = await prisma.calendar.create({
          data: {
            userId,
            name: 'Primary',
            color: '#3B82F6',
            isPrimary: true,
          },
          select: { id: true },
        });
        targetCalendarId = defaultCal?.id;
      }
    }

    // Query existing events for deduplication
    const existingEvents: any[] =
      (await prisma.event.findMany({
        where: { userId },
        select: { id: true, title: true, startTime: true },
      })) ?? [];

    const eventsToCreate: any[] = [];
    const seenInBatch = new Set<string>();

    for (const event of parsedEvents) {
      const normUid = normalizeUid(event.uid);
      const titleKey = `${event.title.trim().toLowerCase()}_${event.startTime.getTime()}`;

      if (normUid && seenInBatch.has(`uid:${normUid}`)) {
        continue;
      }
      if (seenInBatch.has(`title:${titleKey}`)) {
        continue;
      }

      const isDuplicate = existingEvents.some((existing: any) => {
        if (normUid && (existing.id === normUid || existing.id === event.uid)) {
          return true;
        }
        const existingTitle = (existing.title || '').trim().toLowerCase();
        const newTitle = event.title.trim().toLowerCase();
        const existingStart = new Date(existing.startTime).getTime();
        const newStart = event.startTime.getTime();
        return existingTitle === newTitle && existingStart === newStart;
      });

      if (isDuplicate) {
        continue;
      }

      if (normUid) seenInBatch.add(`uid:${normUid}`);
      seenInBatch.add(`title:${titleKey}`);

      const now = new Date();
      const eventCreateData: Record<string, unknown> = {
        ...(normUid ? { id: normUid } : {}),
        title: event.title,
        description: event.description,
        startTime: event.startTime,
        endTime: event.endTime,
        allDay: event.allDay,
        location: event.location,
        userId,
        calendarId: targetCalendarId,
        status: event.status,
        attendees: JSON.stringify([]),
        reminders: JSON.stringify([]),
        recurrenceRule: event.recurrenceRule,
        createdAt: now,
        updatedAt: now,
      };
      if (event.timeZone) {
        eventCreateData.timeZone = event.timeZone;
      }

      eventsToCreate.push(eventCreateData);
    }

    const createdIds: string[] = [];
    const createSingleEvent = async (client: any, data: Record<string, unknown>) => {
      const tzValue = data.timeZone as string | undefined;
      let created: any;
      try {
        created = await client.event.create({ data });
      } catch (err: any) {
        if (
          tzValue &&
          (err?.message?.includes('Unknown argument') || err?.message?.includes('timeZone'))
        ) {
          const copy = { ...data };
          delete copy.timeZone;
          created = await client.event.create({ data: copy });
          created.timeZone = tzValue;
        } else {
          throw err;
        }
      }
      return created;
    };

    if (eventsToCreate.length > 0) {
      if (typeof prisma.$transaction === 'function') {
        await prisma.$transaction(async (tx: any) => {
          for (const data of eventsToCreate) {
            const created = await createSingleEvent(tx, data);
            createdIds.push(created?.id ?? (data.id as string));
          }
        });
      } else {
        for (const data of eventsToCreate) {
          const created = await createSingleEvent(prisma, data);
          createdIds.push(created?.id ?? (data.id as string));
        }
      }
    }

    return reply.status(201).send({
      success: true,
      data: {
        importedCount: createdIds.length,
        eventIds: createdIds,
      },
    });
  };

  const importRouteOptions = { bodyLimit: 5 * 1024 * 1024 };
  fastify.post('/events/import/ics', importRouteOptions, handleIcsImport);
  fastify.post('/events/import', importRouteOptions, handleIcsImport);

  const updateEvent = async (request: any, reply: any) => {
    const parsed = eventUpdateSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const startRaw = parsed.data.start ?? parsed.data.startTime;
    const endRaw = parsed.data.end ?? parsed.data.endTime;
    const start = startRaw ? toDate(startRaw, 'start') : undefined;
    const end = endRaw ? toDate(endRaw, 'end') : undefined;
    if (start && end && end < start)
      throw createAppError('`end` cannot be before `start`', 400, 'INVALID_RANGE');

    const scope =
      parsed.data.scope || (request.query as any)?.scope || (request.body as any)?.scope;

    if (request.params.id.includes('_')) {
      const parentId = request.params.id.split('_')[0]!;
      const occurrenceIso = request.params.id.split('_').slice(1).join('_');
      const parent = (await prisma.event.findUnique({
        where: { id: parentId },
      })) as EventRow | null;
      if (!parent || parent.userId !== userId) {
        throw createAppError('Event not found', 404, 'EVENT_NOT_FOUND');
      }

      const occDate = new Date(occurrenceIso);
      if (Number.isNaN(occDate.getTime())) {
        throw createAppError('Invalid occurrence date', 400, 'INVALID_DATE');
      }

      const eventStartTime = start ?? occDate;
      const parentDuration =
        parent.endTime && parent.startTime
          ? new Date(parent.endTime).getTime() - new Date(parent.startTime).getTime()
          : 3_600_000;
      const eventEndTime =
        end ??
        new Date(eventStartTime.getTime() + (parentDuration > 0 ? parentDuration : 3_600_000));
      if (eventEndTime < eventStartTime) {
        throw createAppError('`end` cannot be before `start`', 400, 'INVALID_RANGE');
      }

      if (parsed.data.checkConflicts && !parsed.data.force) {
        const conflicts = await findEventConflicts(
          prisma,
          recurringService,
          userId,
          eventStartTime,
          eventEndTime,
          [parentId, request.params.id],
        );
        if (conflicts.length > 0) {
          return reply.status(409).send({
            success: false,
            error: 'Event conflicts with existing event(s)',
            code: 'CONFLICT_DETECTED',
            conflicts,
          });
        }
      }

      if (scope === 'this_and_following') {
        let newSeriesRecurrence: string | null = null;
        if (parent.recurrenceRule) {
          const rule = recurringService.parseRRule(parent.recurrenceRule);
          const originalUntil = rule.until;
          const originalExceptions = rule.exceptions;

          rule.until = new Date(occDate.getTime() - 1000);
          const updatedRule = recurringService.serializeRRule(rule);
          await prisma.event.update({
            where: { id: parentId },
            data: { recurrenceRule: updatedRule, updatedAt: new Date() },
          });

          const recurrenceInput = pickRecurrence(parsed.data);
          if (recurrenceInput !== undefined) {
            newSeriesRecurrence = normalizeRecurrenceRule(recurrenceInput, recurringService);
          } else {
            const newRule = {
              ...rule,
              until: originalUntil && originalUntil > occDate ? originalUntil : undefined,
              exceptions: originalExceptions?.filter((ex) => ex >= occDate),
            };
            newSeriesRecurrence = recurringService.serializeRRule(newRule);
          }
        } else {
          const recurrenceInput = pickRecurrence(parsed.data);
          if (recurrenceInput !== undefined) {
            newSeriesRecurrence = normalizeRecurrenceRule(recurrenceInput, recurringService);
          }
        }

        const now = new Date();
        const createPayload: Record<string, unknown> = {
          title: parsed.data.title ?? parent.title,
          description: parsed.data.description ?? parent.description ?? '',
          startTime: eventStartTime,
          endTime: eventEndTime,
          allDay: parsed.data.allDay ?? parent.allDay ?? false,
          location: parsed.data.location ?? parent.location ?? '',
          userId,
          calendarId: parsed.data.calendarId ?? parent.calendarId,
          status: parsed.data.status ?? parent.status ?? 'confirmed',
          recurrenceRule: newSeriesRecurrence,
          attendees: parsed.data.attendees
            ? JSON.stringify(toStoredAttendees(parsed.data.attendees))
            : (parent.attendees ?? JSON.stringify([])),
          reminders: parsed.data.reminders
            ? JSON.stringify(toStoredReminders(parsed.data.reminders))
            : (parent.reminders ?? JSON.stringify([])),
          createdAt: now,
          updatedAt: now,
        };
        const targetTz =
          parsed.data.timeZone ??
          (parsed.data as any).timezone ??
          (parent as any).timeZone ??
          (parent as any).timezone;
        if (targetTz) {
          createPayload.timeZone = targetTz;
        }

        let newSeries: EventRow;
        try {
          newSeries = (await prisma.event.create({
            data: createPayload,
          })) as EventRow;
        } catch (err: any) {
          if (
            targetTz &&
            (err?.message?.includes('Unknown argument') || err?.message?.includes('timeZone'))
          ) {
            delete createPayload.timeZone;
            newSeries = (await prisma.event.create({
              data: createPayload,
            })) as EventRow;
            newSeries.timeZone = targetTz;
          } else {
            throw err;
          }
        }
        if (targetTz && !newSeries.timeZone) {
          newSeries.timeZone = targetTz;
        }

        await callAlertService
          .scheduleAlertsForEvent({
            id: newSeries.id,
            title: newSeries.title,
            userId: newSeries.userId,
            startTime: newSeries.startTime,
            location: newSeries.location,
            reminders: newSeries.reminders as any,
          })
          .catch((err) => {
            request.log.warn({ err }, 'Failed to schedule event call alert');
          });

        return reply.status(200).send({ success: true, data: toEventDto(newSeries) });
      }

      if (parent.recurrenceRule) {
        const rule = recurringService.parseRRule(parent.recurrenceRule);
        rule.exceptions = rule.exceptions ?? [];
        const hasDate = rule.exceptions.some(
          (existing) =>
            existing.getTime() === occDate.getTime() ||
            existing.toISOString().slice(0, 10) === occDate.toISOString().slice(0, 10),
        );
        if (!hasDate) {
          rule.exceptions.push(occDate);
        }
        const updatedRule = recurringService.serializeRRule(rule);
        await prisma.event.update({
          where: { id: parentId },
          data: { recurrenceRule: updatedRule, updatedAt: new Date() },
        });
      }

      const now = new Date();
      const createPayload: Record<string, unknown> = {
        title: parsed.data.title ?? parent.title,
        description: parsed.data.description ?? parent.description ?? '',
        startTime: eventStartTime,
        endTime: eventEndTime,
        allDay: parsed.data.allDay ?? parent.allDay ?? false,
        location: parsed.data.location ?? parent.location ?? '',
        userId,
        calendarId: parsed.data.calendarId ?? parent.calendarId,
        status: parsed.data.status ?? parent.status ?? 'confirmed',
        recurrenceRule: null,
        attendees: parsed.data.attendees
          ? JSON.stringify(toStoredAttendees(parsed.data.attendees))
          : (parent.attendees ?? JSON.stringify([])),
        reminders: parsed.data.reminders
          ? JSON.stringify(toStoredReminders(parsed.data.reminders))
          : (parent.reminders ?? JSON.stringify([])),
        createdAt: now,
        updatedAt: now,
      };
      const targetTz =
        parsed.data.timeZone ??
        (parsed.data as any).timezone ??
        (parent as any).timeZone ??
        (parent as any).timezone;
      if (targetTz) {
        createPayload.timeZone = targetTz;
      }

      let created: EventRow;
      try {
        created = (await prisma.event.create({
          data: createPayload,
        })) as EventRow;
      } catch (err: any) {
        if (
          targetTz &&
          (err?.message?.includes('Unknown argument') || err?.message?.includes('timeZone'))
        ) {
          delete createPayload.timeZone;
          created = (await prisma.event.create({
            data: createPayload,
          })) as EventRow;
          created.timeZone = targetTz;
        } else {
          throw err;
        }
      }
      if (targetTz && !created.timeZone) {
        created.timeZone = targetTz;
      }

      await callAlertService
        .scheduleAlertsForEvent({
          id: created.id,
          title: created.title,
          userId: created.userId,
          startTime: created.startTime,
          location: created.location,
          reminders: created.reminders as any,
        })
        .catch((err) => {
          request.log.warn({ err }, 'Failed to schedule event call alert');
        });

      return reply.send({ success: true, data: toEventDto(created) });
    }

    const eventId = parentEventId(request.params.id);
    const existing = await prisma.event.findUnique({ where: { id: eventId } });
    if (!existing || existing.userId !== userId)
      throw createAppError('Event not found', 404, 'EVENT_NOT_FOUND');

    if (parsed.data.checkConflicts && !parsed.data.force && (start || end)) {
      const targetStart = start ?? new Date(existing.startTime);
      const targetEnd = end ?? new Date(existing.endTime);
      const conflicts = await findEventConflicts(
        prisma,
        recurringService,
        userId,
        targetStart,
        targetEnd,
        [existing.id],
      );
      if (conflicts.length > 0) {
        return reply.status(409).send({
          success: false,
          error: 'Event conflicts with existing event(s)',
          code: 'CONFLICT_DETECTED',
          conflicts,
        });
      }
    }

    const data: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ['title', 'description', 'allDay', 'location', 'status'] as const)
      if (parsed.data[key] !== undefined) data[key] = parsed.data[key];
    if (parsed.data.calendarId !== undefined) data.calendarId = parsed.data.calendarId;
    const tzToUpdate = parsed.data.timeZone ?? (parsed.data as any).timezone;
    if (tzToUpdate !== undefined) data.timeZone = tzToUpdate;
    if (start) data.startTime = start;
    if (end) data.endTime = end;
    if (parsed.data.attendees !== undefined)
      data.attendees = JSON.stringify(toStoredAttendees(parsed.data.attendees));
    if (parsed.data.reminders !== undefined)
      data.reminders = JSON.stringify(toStoredReminders(parsed.data.reminders));
    const recurrence = pickRecurrence(parsed.data);
    if (recurrence !== undefined)
      data.recurrenceRule = normalizeRecurrenceRule(recurrence, recurringService);

    let updated: EventRow;
    try {
      updated = (await prisma.event.update({ where: { id: eventId }, data })) as EventRow;
    } catch (err: any) {
      if (
        tzToUpdate !== undefined &&
        (err?.message?.includes('Unknown argument') || err?.message?.includes('timeZone'))
      ) {
        delete data.timeZone;
        updated = (await prisma.event.update({ where: { id: eventId }, data })) as EventRow;
        updated.timeZone = tzToUpdate;
      } else {
        throw err;
      }
    }
    if (tzToUpdate && !updated.timeZone) {
      updated.timeZone = tzToUpdate;
    }

    await callAlertService.cancelAlertsForEvent(eventId).catch((err) => {
      request.log.warn({ err }, 'Failed to schedule event call alert');
    });
    await callAlertService
      .scheduleAlertsForEvent({
        id: updated.id,
        title: updated.title,
        userId: updated.userId,
        startTime: updated.startTime,
        location: updated.location,
        reminders: updated.reminders as any,
      })
      .catch((err) => {
        request.log.warn({ err }, 'Failed to schedule event call alert');
      });
    return reply.send({ success: true, data: toEventDto(updated) });
  };
  fastify.put('/events/:id', updateEvent);
  fastify.patch('/events/:id', updateEvent);
  fastify.delete<{ Params: { id: string } }>('/events/:id', async (request: any, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);

    if (request.params.id.includes('_')) {
      const parentId = request.params.id.split('_')[0]!;
      const occurrenceIso = request.params.id.split('_').slice(1).join('_');
      const parent = (await prisma.event.findUnique({
        where: { id: parentId },
      })) as EventRow | null;
      if (!parent || parent.userId !== userId) {
        throw createAppError('Event not found', 404, 'EVENT_NOT_FOUND');
      }

      const occDate = new Date(occurrenceIso);
      if (Number.isNaN(occDate.getTime())) {
        throw createAppError('Invalid occurrence date', 400, 'INVALID_DATE');
      }

      const scope = request.query?.scope || request.body?.scope;
      if (scope === 'this_and_following') {
        let until: Date = new Date(occDate.getTime() - 1000);
        if (parent.recurrenceRule) {
          const rule = recurringService.parseRRule(parent.recurrenceRule);
          rule.until = new Date(occDate.getTime() - 1000);
          until = rule.until;
          const updatedRule = recurringService.serializeRRule(rule);
          await prisma.event.update({
            where: { id: parentId },
            data: { recurrenceRule: updatedRule, updatedAt: new Date() },
          });
        }
        return reply.status(200).send({
          success: true,
          data: { message: 'This and following occurrences deleted', until },
        });
      }

      if (parent.recurrenceRule) {
        const rule = recurringService.parseRRule(parent.recurrenceRule);
        rule.exceptions = rule.exceptions ?? [];
        const hasDate = rule.exceptions.some(
          (existing) =>
            existing.getTime() === occDate.getTime() ||
            existing.toISOString().slice(0, 10) === occDate.toISOString().slice(0, 10),
        );
        if (!hasDate) {
          rule.exceptions.push(occDate);
        }
        const updatedRule = recurringService.serializeRRule(rule);
        await prisma.event.update({
          where: { id: parentId },
          data: { recurrenceRule: updatedRule, updatedAt: new Date() },
        });
      }

      return reply.send({
        success: true,
        data: { message: 'Occurrence deleted from series', excludedDate: occurrenceIso },
      });
    }

    const eventId = parentEventId(request.params.id);
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event || event.userId !== userId)
      throw createAppError('Event not found', 404, 'EVENT_NOT_FOUND');
    await prisma.event.delete({ where: { id: eventId } });
    await callAlertService.cancelAlertsForEvent(eventId).catch((err) => {
      request.log.warn({ err }, 'Failed to schedule event call alert');
    });
    return reply.send({ success: true, data: { message: 'Event deleted' } });
  });
  fastify.post<{ Params: { id: string } }>('/events/:id/rsvp', async (request, reply) => {
    const parsed = rsvpSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const event = await prisma.event.findUnique({ where: { id: request.params.id } });
    if (!event) throw createAppError('Event not found', 404, 'EVENT_NOT_FOUND');
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const email = String(user?.email ?? '').toLowerCase();
    let matched = false;
    const attendees = toStoredAttendees(parseJsonArray(event.attendees) as AttendeeInput[]).map(
      (attendee) => {
        if (attendee.userId !== userId && attendee.email.toLowerCase() !== email) return attendee;
        matched = true;
        return { ...attendee, userId: attendee.userId || userId, status: parsed.data.status };
      },
    );
    if (!matched)
      throw createAppError('The authenticated user is not an attendee', 403, 'NOT_EVENT_ATTENDEE');
    const updated = await prisma.event.update({
      where: { id: request.params.id },
      data: { attendees: JSON.stringify(attendees), updatedAt: new Date() },
    });
    return reply.send({ success: true, data: { ...toEventDto(updated), attendees } });
  });

  fastify.post('/booking/links', async (request, reply) => {
    const parsed = bookingLinkSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    return reply.status(201).send({
      success: true,
      data: await bookingService().createBookingLink({
        ...parsed.data,
        userId: requireUserId(request),
      }),
    });
  });
  const handleGetBookingLink = async (
    request: FastifyRequest<{ Params: { slug: string } }>,
    reply: FastifyReply,
  ) => {
    return reply.send({
      success: true,
      data: await bookingService().getBookingLink(request.params.slug),
    });
  };

  const handleGetBookingSlots = async (
    request: FastifyRequest<{ Params: { slug: string }; Querystring: { date?: string } }>,
    reply: FastifyReply,
  ) => {
    if (!request.query.date) {
      throw createAppError('Date query parameter is required', 400, 'VALIDATION_FAILED');
    }
    return reply.send({
      success: true,
      data: await bookingService().getAvailableSlots(
        request.params.slug,
        toDate(request.query.date, 'date'),
      ),
    });
  };

  const handlePostBooking = async (
    request: FastifyRequest<{ Params: { slug: string } }>,
    reply: FastifyReply,
  ) => {
    const parsed = confirmBookingSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const data = await bookingService().confirmBooking(
      request.params.slug,
      toDate(parsed.data.slot, 'slot'),
      { name: parsed.data.name, email: parsed.data.email, notes: parsed.data.notes },
    );
    return reply.status(201).send({ success: true, data });
  };

  fastify.get<{ Params: { slug: string } }>('/booking/links/:slug', handleGetBookingLink);
  fastify.get<{ Params: { slug: string } }>('/calendar/booking/:slug', handleGetBookingLink);

  fastify.get<{ Params: { slug: string }; Querystring: { date?: string } }>(
    '/booking/links/:slug/slots',
    handleGetBookingSlots,
  );
  fastify.get<{ Params: { slug: string }; Querystring: { date?: string } }>(
    '/calendar/booking/:slug/slots',
    handleGetBookingSlots,
  );

  fastify.post<{ Params: { slug: string } }>('/booking/links/:slug/book', handlePostBooking);
  fastify.post<{ Params: { slug: string } }>('/calendar/booking/:slug/book', handlePostBooking);
}
