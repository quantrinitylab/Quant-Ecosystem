import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { CalendarService } from '../services/calendar.service';
import { persistDueCallReminders } from '../services/call-reminder-notify.service';
import { BookingLinkService } from '../services/booking-link.service';
import { RecurringService, type CalendarEvent } from '../services/recurring.service';
import { CalendarCallAlertService } from '../services/calendar-call-alert.service';
import { isSesConfigured, sendViaSes } from '../lib/ses-sender';

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
  return splitEventId(id).parentId;
}
// Occurrence ids are <parentId>_<iso>: occurrences are virtual rows expanded
// from the parent's recurrenceRule, so occurrence-scoped operations resolve to
// the parent (same as DELETE /events/:id). The suffix is the occurrence's
// start instant, percent-decoded.
function splitEventId(id: string): { parentId: string; occurrenceIso: string | null } {
  const idx = id.indexOf('_');
  if (idx === -1) return { parentId: id, occurrenceIso: null };
  return { parentId: id.slice(0, idx), occurrenceIso: decodeURIComponent(id.slice(idx + 1)) };
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
  // The calendar page's create/edit sheet has always sent this top-level.
  // Event has no driveLink column: the value is persisted inside the
  // __QUANT_META__ description header (see setMetaDriveLink), never as a
  // Prisma column.
  driveLink: z.string().max(2000).optional(),
  // fix/qm-period-log-silent-drop-2 — the period/birthday sheets collect
  // these and send them top-level; Zod used to strip them silently and the
  // data never reached storage. Every sheet-collected field is now accepted
  // and folded into the __QUANT_META__ description header (see
  // setMetaSheetFields), the same store driveLink uses — there are no Event
  // columns for them. (moods is the sheet's alias for feelings; pms and
  // giftIdeas have no inputs yet but are accepted so a future input persists
  // instead of vanishing.)
  collectionMethod: z.string().max(100).optional(),
  moods: z.array(z.string().max(100)).max(30).optional(),
  sleep: z.string().max(100).optional(),
  sexLife: z.string().max(100).optional(),
  intimateHealth: z.string().max(100).optional(),
  hotFlashes: z.string().max(100).optional(),
  bbt: z.string().max(20).optional(),
  weight: z.string().max(20).optional(),
  customTags: z.array(z.string().max(100)).max(50).optional(),
  periodDays: z.number().int().min(1).max(15).optional(),
  cycleLength: z.number().int().min(15).max(60).optional(),
  pms: z.boolean().optional(),
  giftIdeas: z.string().max(2000).optional(),
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
  // fix/qm-calendar-event-invites — Gmail parity: creating an event with
  // guests emails them a real METHOD:REQUEST invitation through SES, the same
  // helper the edit/delete paths use. `sendInvites: false` opts out (the UI
  // does not offer this today — it always sends). Defaults to true so guests
  // learn about a new meeting on create, not only when the organizer tells
  // them another way.
  sendInvites: z.boolean().optional(),
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
  // Gmail parity (fix/qm-calendar-event-guest-notify): the client asks
  // explicitly whether to notify guests on save; the backend only emails when
  // this flag is true. Defaults to false so edits never mail guests silently.
  sendUpdate: z.boolean().optional(),
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
  // Host's IANA timezone anchoring the availability window
  // (fix/qm-booking-tz-availability-2); invalid/missing values normalize to
  // 'UTC' in the service.
  timezone: z.string().max(64).optional(),
});
const lockSlotSchema = z.object({
  slot: z.string(),
  email: z.string().email(),
});
const confirmBookingSchema = z.object({
  slot: z.string(),
  name: z.string().min(1),
  email: z.string().email(),
  notes: z.string().optional(),
  lockId: z.string().optional(),
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
// Email-shape check shared by attendee persistence (toStoredAttendees) and
// ICS emission (buildIcsContent). Deliberately a shape check, not a
// deliverability check — it exists to stop non-addresses like "hello" from
// being stored as invitees or emitted as `ATTENDEE:...:mailto:hello` lines.
function isEmailShaped(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
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
    // Email-shape guard: "hello" is not an invitee. Dropped here (not 400'd —
    // a guest list must never be able to 400 the whole save) and skipped at
    // ICS emission below, so malformed `mailto:` lines are never produced.
    if (!email || !isEmailShaped(email) || seen.has(email.toLowerCase())) continue;
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
const QUANT_META_PREFIX = '__QUANT_META__:';
const QUANT_META_SUFFIX = ':__END_QUANT_META__';

interface QuantMetaMatch {
  /** The full `__QUANT_META__:{...}:__END_QUANT_META__` header text. */
  full: string;
  /** The raw JSON payload between the prefix and the suffix. */
  json: string;
  /** Offset of the header inside the source string. */
  index: number;
}

/**
 * Find a __QUANT_META__ header with plain indexOf scans (linear time).
 *
 * This replaces the old lazy regex
 * /__QUANT_META__:([\s\S]*?):__END_QUANT_META__/ — CodeQL flagged it as a
 * polynomial ReDoS on user-controlled descriptions (a string starting with
 * `__QUANT_META__:` followed by many `__QUANT_META__:a` repetitions makes the
 * lazy quantifier rescan quadratically). indexOf finds the FIRST prefix and
 * the FIRST suffix after it, which is exactly what the lazy match returned,
 * in linear time on any input.
 */
function matchQuantMeta(raw: string): QuantMetaMatch | null {
  const start = raw.indexOf(QUANT_META_PREFIX);
  if (start === -1) return null;
  const jsonStart = start + QUANT_META_PREFIX.length;
  const end = raw.indexOf(QUANT_META_SUFFIX, jsonStart);
  if (end === -1) return null;
  return {
    full: raw.slice(start, end + QUANT_META_SUFFIX.length),
    json: raw.slice(jsonStart, end),
    index: start,
  };
}

/**
 * Remove the first __QUANT_META__ header (plus one trailing newline when
 * present), mirroring the old
 * raw.replace(/__QUANT_META__:[\s\S]*?:__END_QUANT_META__\n?/, '').
 */
function stripQuantMeta(raw: string): string {
  const match = matchQuantMeta(raw);
  if (!match) return raw;
  const rest = raw.slice(0, match.index) + raw.slice(match.index + match.full.length);
  return rest.charAt(match.index) === '\n'
    ? rest.slice(0, match.index) + rest.slice(match.index + 1)
    : rest;
}

/**
 * Remove EVERY __QUANT_META__ header, not just the first.
 * fix/qm-quant-meta-strip: rows edited through the old calendar sheet carry
 * N stale header copies (one stacked per save). Header writers collapse
 * through this so storage keeps exactly one header; the read path
 * (matchQuantMeta, first/newest wins) is untouched.
 */
function stripAllQuantMeta(raw: string): string {
  let out = raw;
  let prev: string;
  do {
    prev = out;
    out = stripQuantMeta(out);
  } while (out !== prev);
  return out;
}

/**
 * Persist a top-level `driveLink` payload field inside the __QUANT_META__
 * description header — the established store for type/priority/subtasks, and
 * the only place Event can carry the link (there is no driveLink column).
 *
 * A non-empty value is stored; an empty/missing value clears a previously
 * stored link so a cleared form field never leaves a stale URL behind.
 * Returns the description unchanged when there is nothing to write or clear,
 * so unrelated updates never rewrite the header.
 */
function setMetaDriveLink(description: string, driveLink: string | undefined): string {
  const trimmed = typeof driveLink === 'string' ? driveLink.trim() : '';
  const raw = description ?? '';
  const match = matchQuantMeta(raw);
  let meta: Record<string, unknown>;
  if (match) {
    try {
      meta = JSON.parse(match.json) as Record<string, unknown>;
    } catch {
      // Corrupt header: only rewrite when there is a link to store.
      if (!trimmed) return raw;
      meta = {};
    }
  } else {
    meta = {};
  }
  const existing = typeof meta.driveLink === 'string' ? (meta.driveLink as string).trim() : '';
  if (!trimmed && !existing) return raw;
  if (trimmed) {
    meta.driveLink = trimmed;
  } else {
    delete meta.driveLink;
  }
  const header = `__QUANT_META__:${JSON.stringify(meta)}:__END_QUANT_META__`;
  const body = stripAllQuantMeta(raw).trim();  // fix/qm-quant-meta-strip: collapse stale stacked headers so storage keeps exactly one
  return body ? `${header}\n${body}` : `${header}\n`;
}

/**
 * fix/qm-period-log-silent-drop-2 — the top-level sheet fields Zod now
 * accepts (collectionMethod, moods, sleep, sexLife, intimateHealth,
 * hotFlashes, bbt, weight, customTags, periodDays, cycleLength, pms,
 * giftIdeas) live in the __QUANT_META__ description header like driveLink
 * does, because Event has no columns for them. Only keys present in the
 * payload are touched, so a partial update never clears fields the edit
 * screen didn't send. An empty string / empty array clears a previously
 * stored value so a cleared form field never leaves stale data behind —
 * the same principle as setMetaDriveLink.
 */
const SHEET_META_FIELD_KEYS = [
  'collectionMethod',
  'moods',
  'sleep',
  'sexLife',
  'intimateHealth',
  'hotFlashes',
  'bbt',
  'weight',
  'customTags',
  'periodDays',
  'cycleLength',
  'pms',
  'giftIdeas',
] as const;

/** Extract the sheet-meta patch: only payload keys that were actually sent. */
function sheetMetaPatch(data: Record<string, unknown>): Record<string, unknown> | null {
  let patch: Record<string, unknown> | null = null;
  for (const key of SHEET_META_FIELD_KEYS) {
    const value = data[key];
    if (value !== undefined) {
      patch ??= {};
      patch[key] = value;
    }
  }
  return patch;
}

/**
 * Merge a sheet-meta patch into the __QUANT_META__ header. Returns the
 * description unchanged when there is nothing to write or clear, so
 * unrelated updates never rewrite the header.
 */
function setMetaSheetFields(description: string, patch: Record<string, unknown> | null): string {
  if (!patch) return description;
  const raw = description ?? '';
  const match = matchQuantMeta(raw);
  let meta: Record<string, unknown>;
  if (match) {
    try {
      meta = JSON.parse(match.json) as Record<string, unknown>;
    } catch {
      // Corrupt header: only rewrite when the patch has something to store.
      meta = {};
    }
  } else {
    meta = {};
  }
  const before = JSON.stringify(meta);
  for (const [key, value] of Object.entries(patch)) {
    if (value === '' || (Array.isArray(value) && value.length === 0)) {
      // Cleared form field: drop the stored value instead of keeping stale data.
      delete meta[key];
    } else {
      meta[key] = value;
    }
  }
  if (JSON.stringify(meta) === before && match) return raw;
  if (JSON.stringify(meta) === '{}' && !match) return raw;
  const header = `__QUANT_META__:${JSON.stringify(meta)}:__END_QUANT_META__`;
  const body = stripAllQuantMeta(raw).trim();  // fix/qm-quant-meta-strip: collapse stale stacked headers so storage keeps exactly one
  return body ? `${header}\n${body}` : `${header}\n`;
}

/**
 * Convenience wrapper: fold the sheet's top-level period/birthday fields
 * into the __QUANT_META__ header. A no-op when the payload carries none of
 * them, so unrelated saves keep their description byte-identical.
 */
function applySheetMeta(description: string, data: Record<string, unknown>): string {
  return setMetaSheetFields(description, sheetMetaPatch(data));
}

/**
 * Partial-update safety: edit screens that strip the __QUANT_META__ header
 * before saving (the event detail page seeds its form with the stripped
 * description) must not wipe the stored meta as a side effect. Re-attach the
 * existing header so driveLink/type/priority survive a title/location edit.
 * A description that still carries its own header is returned untouched.
 */
function preserveMetaHeader(description: string, existingDescription: string): string {
  if (matchQuantMeta(description)) return description;
  const match = matchQuantMeta(existingDescription ?? '');
  if (!match) return description;
  const body = description.trim();
  return body ? `${match.full}\n${body}` : `${match.full}\n`;
}

function toEventDto(event: EventRow | CalendarEvent) {
  let recurrenceParentId: string | undefined =
    (event as CalendarEvent).recurrenceParentId ??
    (event as CalendarEvent).parentId ??
    (event.id.includes('_') ? event.id.split('_')[0] : undefined);
  let originalStartTime: string | undefined =
    (event as CalendarEvent).originalStartTime instanceof Date
      ? ((event as CalendarEvent).originalStartTime as Date).toISOString()
      : typeof (event as CalendarEvent).originalStartTime === 'string'
        ? ((event as CalendarEvent).originalStartTime as string)
        : undefined;

  const desc = event.description || '';
  let driveLink: string | undefined;
  // Sheet-type round-trip (fix/qm-calendar-sheet-meta-roundtrip): the create
  // sheet stores the sheet type plus task/birthday/period payload fields in
  // the __QUANT_META__ description header, and the edit sheet restores the
  // form from ev.type/ev.priority/ev.subtasks/… The DTO previously parsed
  // only recurrenceParentId/originalStartTime/driveLink out of that header,
  // so after any reload a saved Task/Birthday/Period reopened as a generic
  // "Event" and its priority/subtasks/cycle data never came back. Every
  // value is validated against the sheet's own vocabulary: garbage in the
  // header is dropped, never echoed to the client.
  let type: string | undefined;
  let priority: string | undefined;
  let subtasks: Array<{ text: string; done: boolean }> | undefined;
  let birthYear: string | undefined;
  let flowIntensity: string | undefined;
  let spottingColor: string | undefined;
  let cycleDay: number | undefined;
  let feelings: string[] | undefined;
  let pain: string[] | undefined;
  let energy: string | undefined;
  // fix/qm-period-log-silent-drop-2: the rest of the sheet-collected
  // period/birthday detail — persisted in the __QUANT_META__ header by
  // setMetaSheetFields, parsed back here so the edit sheet restores them.
  let collectionMethod: string | undefined;
  let moods: string[] | undefined;
  let sleep: string | undefined;
  let sexLife: string | undefined;
  let intimateHealth: string | undefined;
  let hotFlashes: string | undefined;
  let bbt: string | undefined;
  let weight: string | undefined;
  let customTags: string[] | undefined;
  let periodDays: number | undefined;
  let cycleLength: number | undefined;
  let pms: boolean | undefined;
  let giftIdeas: string | undefined;
  const metaMatch = matchQuantMeta(desc);
  if (metaMatch) {
    try {
      const meta = JSON.parse(metaMatch.json);
      if (meta.recurrenceParentId) recurrenceParentId = meta.recurrenceParentId;
      if (meta.originalStartTime) originalStartTime = meta.originalStartTime;
      if (typeof meta.driveLink === 'string' && meta.driveLink.trim())
        driveLink = meta.driveLink.trim();
      if (
        typeof meta.type === 'string' &&
        (['event', 'task', 'birthday', 'period'] as string[]).includes(meta.type)
      )
        type = meta.type;
      if (
        typeof meta.priority === 'string' &&
        (['low', 'medium', 'urgent'] as string[]).includes(meta.priority)
      )
        priority = meta.priority;
      if (Array.isArray(meta.subtasks))
        subtasks = meta.subtasks
          .filter((s: unknown): s is Record<string, unknown> => typeof s === 'object' && s !== null)
          .map((s: Record<string, unknown>) => ({ text: String(s.text ?? ''), done: Boolean(s.done) }));
      if (typeof meta.birthYear === 'string' && meta.birthYear.trim())
        birthYear = meta.birthYear.trim();
      if (
        typeof meta.flowIntensity === 'string' &&
        (['light', 'medium', 'heavy', 'super_heavy', 'spotting'] as string[]).includes(
          meta.flowIntensity,
        )
      )
        flowIntensity = meta.flowIntensity;
      if (
        typeof meta.spottingColor === 'string' &&
        (['red', 'brown'] as string[]).includes(meta.spottingColor)
      )
        spottingColor = meta.spottingColor;
      if (typeof meta.cycleDay === 'number' && Number.isFinite(meta.cycleDay))
        cycleDay = meta.cycleDay;
      if (Array.isArray(meta.feelings))
        feelings = meta.feelings.filter((f: unknown): f is string => typeof f === 'string');
      if (Array.isArray(meta.pain))
        pain = meta.pain.filter((p: unknown): p is string => typeof p === 'string');
      if (typeof meta.energy === 'string' && meta.energy.trim()) energy = meta.energy;
      // fix/qm-period-log-silent-drop-2: sheet-collected period/birthday
      // detail. Every value is validated against the sheet's own shape —
      // garbage in the header is dropped, never echoed to the client.
      const cleanStr = (v: unknown, max: number): string | undefined =>
        typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;
      const cleanStrArr = (v: unknown, maxItems: number, maxLen: number): string[] | undefined =>
        Array.isArray(v)
          ? v
              .filter((s: unknown): s is string => typeof s === 'string' && s.trim() !== '')
              .map((s: string) => s.trim().slice(0, maxLen))
              .slice(0, maxItems)
          : undefined;
      const cleanInt = (v: unknown, min: number, max: number): number | undefined =>
        typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : undefined;
      collectionMethod = cleanStr(meta.collectionMethod, 100);
      moods = cleanStrArr(meta.moods, 30, 100);
      sleep = cleanStr(meta.sleep, 100);
      sexLife = cleanStr(meta.sexLife, 100);
      intimateHealth = cleanStr(meta.intimateHealth, 100);
      hotFlashes = cleanStr(meta.hotFlashes, 100);
      bbt = cleanStr(meta.bbt, 20);
      weight = cleanStr(meta.weight, 20);
      customTags = cleanStrArr(meta.customTags, 50, 100);
      periodDays = cleanInt(meta.periodDays, 1, 15);
      cycleLength = cleanInt(meta.cycleLength, 15, 60);
      if (typeof meta.pms === 'boolean') pms = meta.pms;
      giftIdeas = cleanStr(meta.giftIdeas, 2000);
    } catch {
      // ignore
    }
  }

  let exdates: string[] | undefined;
  if (event.recurrenceRule && event.recurrenceRule.includes('EXDATE=')) {
    const exMatch = /EXDATE=([^;]+)/i.exec(event.recurrenceRule);
    if (exMatch) {
      exdates = exMatch[1]!
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  return {
    id: event.id,
    parentId:
      (event as CalendarEvent).parentId ??
      recurrenceParentId ??
      (event.id.includes('_') ? event.id.split('_')[0] : event.id),
    recurrenceParentId,
    originalStartTime,
    exdates,
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
    driveLink,
    // Sheet-type fields parsed from the __QUANT_META__ header (undefined
    // unless the header carried a valid value — the edit sheet falls back
    // to its defaults, so an absent key must stay absent, never null).
    type,
    priority,
    subtasks,
    birthYear,
    flowIntensity,
    spottingColor,
    cycleDay,
    feelings,
    pain,
    energy,
    // fix/qm-period-log-silent-drop-2: sheet-collected period/birthday detail
    // parsed from the __QUANT_META__ header (undefined unless the header
    // carried a valid value — the edit sheet falls back to its defaults).
    collectionMethod,
    moods,
    sleep,
    sexLife,
    intimateHealth,
    hotFlashes,
    bbt,
    weight,
    customTags,
    periodDays,
    cycleLength,
    pms,
    giftIdeas,
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
      // Legacy rows can hold non-email strings ("hello" was storable before
      // attendee validation) — never emit a malformed `ATTENDEE:...:mailto:`
      // line that foreign calendar clients choke on.
      if (!isEmailShaped(email)) continue;
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

  // Lifecycle: the default service owns a real BullMQ TypedQueue when
  // REDIS_URL is set; close it on Fastify onClose so app.close() never
  // leaves an orphaned Redis connection (same teardown class as the ci-runs
  // queue lifecycle fix). Service close() is idempotent and a no-op for
  // injected (caller-owned) queues, so this hook is safe for both paths.
  fastify.addHook('onClose', async () => {
    await callAlertService.close();
  });

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
      q?: string;
    };
  }>('/events', async (request, reply) => {
    const userId = requireUserId(request);
    const { start, end, calendarId, cursor } = request.query;
    // K10: full-text-ish filter over title/description/location so Universal
    // Search has a real calendar backend endpoint (case-insensitive contains).
    const q = request.query.q?.trim();
    const textMatch = q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
            { location: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {};
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
          ...textMatch,
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
          ...textMatch,
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
    const where: Record<string, unknown> = { userId, ...textMatch };
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
    const prisma = getPrisma(fastify);
    // QM-SCREEN-015: the due alarms computed here used to die in this
    // response — the endpoint had zero consumers, so call reminders never
    // reached anyone. The computation now also persists one `call_reminder`
    // notification row per due alarm (userId-scoped, idempotent) and pushes
    // it via deliverPushToUser; both are contained, so a persistence or push
    // failure never fails this read. The response contract is unchanged.
    const result = await persistDueCallReminders(
      {
        events: prisma.event,
        notifications: prisma.notification,
        push: { store: prisma.pushSubscription },
        log: request.log,
      },
      userId,
      new Date(),
    );
    return reply.send({ success: true, data: result.due });
  });
  fastify.get('/events/alerts/scheduled', async (request, reply) => {
    return reply.send({
      success: true,
      data: callAlertService.getScheduledAlerts(requireUserId(request)),
    });
  });
  // `allowAttendees` opens the read gate to the event's attendee list —
  // exactly the matcher POST /events/:id/rsvp uses (attendee row's userId,
  // or the viewer's account email against the attendee's email,
  // case-insensitive). Callers that stay owner-only (ICS downloads) pass
  // nothing. Only read paths may opt in; writes stay owner-only.
  const getEventForIcs = async (
    prisma: any,
    id: string,
    userId: string,
    options?: { allowAttendees?: boolean },
  ): Promise<EventRow> => {
    const canRead = async (row: EventRow): Promise<boolean> => {
      if (row.userId === userId) return true;
      return options?.allowAttendees === true && (await isViewerAttendee(prisma, row, userId));
    };
    let event = (await prisma.event.findUnique({
      where: { id },
    })) as EventRow | null;
    if (!event && id.includes('_')) {
      const parentId = id.split('_')[0]!;
      const occIso = id.split('_').slice(1).join('_');
      const parent = (await prisma.event.findUnique({
        where: { id: parentId },
      })) as EventRow | null;
      if (parent && (await canRead(parent))) {
        const occStart = new Date(occIso);
        // An occurrence id whose suffix is not a real ISO instant is not a
        // real event — 404 rather than synthesizing an Invalid-Date row.
        if (Number.isNaN(occStart.getTime())) {
          throw createAppError('Event not found', 404, 'EVENT_NOT_FOUND');
        }
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
    if (!event || !(await canRead(event))) {
      throw createAppError('Event not found', 404, 'EVENT_NOT_FOUND');
    }
    return event;
  };

  // The detail page's "Your response" RSVP widget must only be offered to an
  // actual attendee. Match exactly the way POST /events/:id/rsvp matches:
  // attendee row's userId, or the viewer's account email against the
  // attendee's email (case-insensitive).
  const isViewerAttendee = async (
    prisma: any,
    event: EventRow,
    userId: string,
  ): Promise<boolean> => {
    if (!prisma.user || typeof prisma.user.findUnique !== 'function') return false;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const email = String(user?.email ?? '').toLowerCase();
    return toStoredAttendees(parseJsonArray(event.attendees) as AttendeeInput[]).some(
      (attendee) => attendee.userId === userId || attendee.email.toLowerCase() === email,
    );
  };

  fastify.get<{ Params: { id: string } }>('/events/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    // Resolves recurring occurrence ids (<parentId>_<iso>) the same way the
    // ICS endpoints do, so a detail link from search/list never 404s on a
    // real occurrence.
    //
    // The organizer AND the event's attendees may read the detail —
    // mirroring the POST /events/:id/rsvp attendee matcher — so an invitee
    // sees the event and the "Your response" widget instead of a hard 404.
    // Attendees get a read-only view: writes (PUT/PATCH/DELETE) stay
    // owner-only, and the page hides the Edit/Delete controls for them via
    // viewerIsOwner below.
    const event = await getEventForIcs(prisma, request.params.id, userId, { allowAttendees: true });
    return reply.send({
      success: true,
      data: {
        ...toEventDto(event as EventRow),
        viewerIsAttendee: await isViewerAttendee(prisma, event, userId),
        viewerIsOwner: event.userId === userId,
      },
    });
  });

  const getOrganizerInfo = async (prisma: any, userId: string) => {
    if (!prisma.user || typeof prisma.user.findUnique !== 'function') return undefined;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true, email: true },
    });
    return user?.email ? { name: user.displayName || undefined, email: user.email } : undefined;
  };

  // ========================================================================
  // Guest notifications (fix/qm-calendar-event-guest-notify).
  //
  // Editing or deleting an event used to touch only prisma + the call-alert
  // service — invitees silently missed moved/cancelled meetings. This helper
  // is the honest mail path: it sends a real METHOD:REQUEST (creation or
  // update) or METHOD:CANCEL (cancellation) ICS email to the event's guests
  // through SES, and reports exactly what happened so the UI can tell the
  // truth instead of faking a confirmation.
  //
  // It never throws: the event write already succeeded before this runs, so
  // a mail outage must not fail the save/delete. Failure is reported in the
  // returned status ({ notified: false, reason }) and logged.
  // ========================================================================
  type GuestNotificationStatus = {
    notified: boolean;
    count: number;
    reason?:
      | 'sent'
      | 'no-guests'
      | 'not-requested'
      | 'declined'
      | 'mail-not-configured'
      | 'send-failed'
      | 'occurrence-notify-not-wired';
  };

  const OCCURRENCE_NOTIFY_NOT_WIRED: GuestNotificationStatus = {
    notified: false,
    count: 0,
    reason: 'occurrence-notify-not-wired',
  };

  function formatEventWhen(start: Date, end: Date): string {
    const fmt = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    return `${fmt.format(start)} – ${fmt.format(end)}`;
  }

  const notifyEventGuests = async (
    event: EventRow,
    organizer: { name?: string; email: string } | undefined,
    kind: 'creation' | 'update' | 'cancellation',
    request: unknown,
  ): Promise<GuestNotificationStatus> => {
    const log = (request as { log?: { warn: (...args: unknown[]) => void } })?.log;
    const organizerEmail = String(organizer?.email ?? '').toLowerCase();
    const seen = new Set<string>();
    const guests: string[] = [];
    for (const email of attendeeEmails(event.attendees)) {
      const trimmed = String(email ?? '').trim();
      if (!trimmed || !isEmailShaped(trimmed)) continue;
      const lowered = trimmed.toLowerCase();
      if (lowered === organizerEmail || seen.has(lowered)) continue;
      seen.add(lowered);
      guests.push(trimmed);
    }
    if (guests.length === 0) {
      return { notified: false, count: 0, reason: 'no-guests' };
    }
    if (!organizer?.email || !isSesConfigured()) {
      return { notified: false, count: 0, reason: 'mail-not-configured' };
    }
    const method = kind === 'cancellation' ? 'CANCEL' : 'REQUEST';
    const ics = buildIcsContent(event, {
      method,
      organizer,
      sequence: kind === 'cancellation' ? 1 : 0,
    });
    const when = formatEventWhen(new Date(event.startTime), new Date(event.endTime));
    const organizerName = organizer.name || organizer.email;
    const subject =
      kind === 'cancellation'
        ? `Cancelled: ${event.title}`
        : kind === 'creation'
          ? `Invitation: ${event.title}`
          : `Updated invitation: ${event.title}`;
    const bodyText =
      kind === 'cancellation'
        ? `${organizerName} has cancelled "${event.title}".\n\nWhen: ${when}\n${
            event.location ? `Where: ${event.location}\n` : ''
          }\nThis meeting has been cancelled and removed from the organizer's calendar.`
        : kind === 'creation'
          ? `${organizerName} has invited you to "${event.title}".\n\nWhen: ${when}\n${
              event.location ? `Where: ${event.location}\n` : ''
            }\nThe invitation is attached as an .ics file — add it to your calendar to stay in sync.`
          : `${organizerName} has updated "${event.title}".\n\nWhen: ${when}\n${
              event.location ? `Where: ${event.location}\n` : ''
            }\nThe updated invitation is attached as an .ics file — add it to your calendar to stay in sync.`;
    const bodyHtml =
      kind === 'cancellation'
        ? `<p><strong>${escapeHtml(organizerName)}</strong> has cancelled ` +
          `<strong>${escapeHtml(event.title)}</strong>.</p>` +
          `<p>When: ${escapeHtml(when)}${event.location ? `<br>Where: ${escapeHtml(event.location)}` : ''}</p>` +
          `<p>This meeting has been cancelled and removed from the organizer's calendar.</p>`
        : kind === 'creation'
          ? `<p><strong>${escapeHtml(organizerName)}</strong> has invited you to ` +
            `<strong>${escapeHtml(event.title)}</strong>.</p>` +
            `<p>When: ${escapeHtml(when)}${event.location ? `<br>Where: ${escapeHtml(event.location)}` : ''}</p>` +
            `<p>The invitation is attached as an .ics file — add it to your calendar to stay in sync.</p>`
          : `<p><strong>${escapeHtml(organizerName)}</strong> has updated ` +
            `<strong>${escapeHtml(event.title)}</strong>.</p>` +
            `<p>When: ${escapeHtml(when)}${event.location ? `<br>Where: ${escapeHtml(event.location)}` : ''}</p>` +
            `<p>The updated invitation is attached as an .ics file — add it to your calendar to stay in sync.</p>`;
    try {
      await sendViaSes({
        from: `${organizerName} <${organizer.email}>`,
        to: guests,
        replyTo: organizer.email,
        subject,
        bodyText,
        bodyHtml,
        attachments: [
          {
            filename: `${event.title || 'event'}_${method.toLowerCase()}.ics`,
            contentType: 'text/calendar; method=' + method,
            content: Buffer.from(ics, 'utf8'),
          },
        ],
      });
      return { notified: true, count: guests.length, reason: 'sent' };
    } catch (err) {
      log?.warn(
        { err, eventId: event.id, kind },
        'Guest notification email failed to send',
      );
      return { notified: false, count: 0, reason: 'send-failed' };
    }
  };

  const escapeHtml = (value: string): string =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  // ========================================================================
  // Organizer RSVP notifications (fix/qm-calendar-rsvp-organizer-notify).
  //
  // RSVPing used to persist the guest's response into the event attendee JSON
  // and stop there — the organizer had to open the event to discover any
  // response. This helper is the honest mail path: when a guest accepts,
  // declines or tentatively accepts, the organizer gets a real notification
  // email through SES (Gmail parity: RSVP response emails).
  //
  // It never throws: the RSVP write already succeeded before this runs, so
  // a mail outage must not fail the response. Failure is reported in the
  // returned status ({ notified: false, reason }) and logged.
  // ========================================================================
  type RsvpNotificationStatus = {
    notified: boolean;
    count: number;
    reason?:
      | 'sent'
      | 'self-rsvp'
      | 'not-a-response'
      | 'no-organizer-email'
      | 'mail-not-configured'
      | 'send-failed';
  };

  const notifyOrganizerOfRsvp = async (
    prisma: any,
    event: EventRow,
    guest: { name?: string; email?: string } | null,
    status: 'accepted' | 'declined' | 'tentative' | 'pending',
    rsvpUserId: string,
    request: unknown,
  ): Promise<RsvpNotificationStatus> => {
    const log = (request as { log?: { warn: (...args: unknown[]) => void } })?.log;
    // 'pending' is the unset state, not a response — notifying on it would
    // spam the organizer with non-news.
    if (status === 'pending') {
      return { notified: false, count: 0, reason: 'not-a-response' };
    }
    // The organizer changing their own status is not news to the organizer.
    if (String(event.userId ?? '') === String(rsvpUserId ?? '')) {
      return { notified: false, count: 0, reason: 'self-rsvp' };
    }
    const organizer = await getOrganizerInfo(prisma, String(event.userId ?? ''));
    if (!organizer?.email || !isEmailShaped(organizer.email)) {
      return { notified: false, count: 0, reason: 'no-organizer-email' };
    }
    if (!isSesConfigured()) {
      return { notified: false, count: 0, reason: 'mail-not-configured' };
    }
    const guestName =
      String(guest?.name ?? '').trim() ||
      String(guest?.email ?? '').trim() ||
      'A guest';
    const guestEmail = String(guest?.email ?? '').trim();
    const verb =
      status === 'accepted' ? 'accepted' : status === 'declined' ? 'declined' : 'tentatively accepted';
    const when = formatEventWhen(new Date(event.startTime), new Date(event.endTime));
    const subject = `${guestName} ${verb}: ${event.title}`;
    const bodyText =
      `${guestName} has ${verb} "${event.title}".\n\n` +
      `When: ${when}\n` +
      `${event.location ? `Where: ${event.location}\n` : ''}` +
      `\nYou're receiving this because you're the organizer of this event.`;
    const bodyHtml =
      `<p><strong>${escapeHtml(guestName)}</strong> has ${escapeHtml(verb)} ` +
      `<strong>${escapeHtml(event.title)}</strong>.</p>` +
      `<p>When: ${escapeHtml(when)}${event.location ? `<br>Where: ${escapeHtml(event.location)}` : ''}</p>` +
      `<p>You're receiving this because you're the organizer of this event.</p>`;
    try {
      // Sent from the product identity (never impersonate the guest — their
      // address is not a verified SES identity); replyTo routes the
      // organizer's reply straight to the guest.
      await sendViaSes({
        from:
          process.env['CALENDAR_RSVP_NOTIFY_FROM'] ?? 'QuantMail Calendar <no-reply@quantmail.in>',
        to: [organizer.email],
        ...(isEmailShaped(guestEmail) ? { replyTo: guestEmail } : {}),
        subject,
        bodyText,
        bodyHtml,
      });
      return { notified: true, count: 1, reason: 'sent' };
    } catch (err) {
      log?.warn(
        { err, eventId: event.id, status },
        'Organizer RSVP notification email failed to send',
      );
      return { notified: false, count: 0, reason: 'send-failed' };
    }
  };

  // ========================================================================
  // Host booking notifications (fix/qm-booking-host-email).
  //
  // Confirming a booking through a public link created the event + the ICS
  // invite and stopped there — the host had to open their calendar to
  // discover the new booking. This helper is the honest mail path: after the
  // booking write succeeds, the host gets a real notification email through
  // SES (Gmail parity: new-booking emails), with the real .ics attached.
  //
  // It never throws: the booking write already succeeded before this runs,
  // so a mail outage must not fail the booking. Failure is reported in the
  // returned status ({ notified: false, reason }) and logged.
  // ========================================================================
  type BookingNotificationStatus = {
    notified: boolean;
    count: number;
    reason?: 'sent' | 'no-host-email' | 'mail-not-configured' | 'send-failed';
  };

  const notifyHostOfBooking = async (
    confirmation: {
      event: unknown;
      icsContent: string;
      hostName: string | null;
      hostEmail: string | null;
    },
    booker: { name: string; email: string; notes?: string },
    request: unknown,
  ): Promise<BookingNotificationStatus> => {
    const log = (request as { log?: { warn: (...args: unknown[]) => void } })?.log;
    // The host email is the link owner's real address (BookingLinkService
    // resolveHost); null when the owner cannot be resolved — never fabricate.
    const hostEmail = String(confirmation.hostEmail ?? '').trim();
    if (!hostEmail || !isEmailShaped(hostEmail)) {
      return { notified: false, count: 0, reason: 'no-host-email' };
    }
    if (!isSesConfigured()) {
      return { notified: false, count: 0, reason: 'mail-not-configured' };
    }
    const event = confirmation.event as EventRow;
    const eventTitle = String(event?.title ?? '').trim() || 'a new booking';
    const hostName = String(confirmation.hostName ?? '').trim() || hostEmail;
    const bookerName =
      String(booker.name ?? '').trim() ||
      String(booker.email ?? '').trim() ||
      'A guest';
    const bookerEmail = String(booker.email ?? '').trim();
    const notes = String(booker.notes ?? '').trim();
    const when = formatEventWhen(new Date(event.startTime), new Date(event.endTime));
    const subject = `New booking: ${bookerName} booked ${eventTitle}`;
    const bodyText =
      `Hi ${hostName},\n\n` +
      `${bookerName}${isEmailShaped(bookerEmail) ? ` (${bookerEmail})` : ''} just booked "${eventTitle}" through your booking link.\n\n` +
      `When: ${when}\n` +
      (notes ? `Notes: ${notes}\n` : '') +
      `\nThe calendar invite (.ics) is attached.\n\nYou're receiving this because you're the host of this booking link.`;
    const bodyHtml =
      `<p>Hi ${escapeHtml(hostName)},</p>` +
      `<p><strong>${escapeHtml(bookerName)}</strong>` +
      `${isEmailShaped(bookerEmail) ? ` (${escapeHtml(bookerEmail)})` : ''} ` +
      `just booked <strong>${escapeHtml(eventTitle)}</strong> through your booking link.</p>` +
      `<p>When: ${escapeHtml(when)}</p>` +
      (notes ? `<p>Notes: ${escapeHtml(notes)}</p>` : '') +
      `<p>The calendar invite (.ics) is attached.</p>` +
      `<p>You're receiving this because you're the host of this booking link.</p>`;
    try {
      // Sent from the product identity (never impersonate the booker — their
      // address is not a verified SES identity); replyTo routes the host's
      // reply straight to the booker.
      await sendViaSes({
        from:
          process.env['CALENDAR_BOOKING_NOTIFY_FROM'] ??
          'QuantMail Calendar <no-reply@quantmail.in>',
        to: [hostEmail],
        ...(isEmailShaped(bookerEmail) ? { replyTo: bookerEmail } : {}),
        subject,
        bodyText,
        bodyHtml,
        attachments: [
          {
            filename: 'booking.ics',
            contentType: 'text/calendar',
            content: Buffer.from(confirmation.icsContent, 'utf-8'),
          },
        ],
      });
      return { notified: true, count: 1, reason: 'sent' };
    } catch (err) {
      log?.warn({ err }, 'Host booking notification email failed to send');
      return { notified: false, count: 0, reason: 'send-failed' };
    }
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
      // driveLink + the sheet's period/birthday fields ride in __QUANT_META__
      // (Event has no columns for them); a top-level payload field that Zod
      // accepted must not be silently dropped.
      description: applySheetMeta(
        parsed.data.driveLink !== undefined
          ? setMetaDriveLink(parsed.data.description ?? '', parsed.data.driveLink)
          : (parsed.data.description ?? ''),
        parsed.data,
      ),
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
    // fix/qm-calendar-event-invites — Gmail parity: the event is persisted
    // above, so guest notification happens OUTSIDE the write. A mail failure
    // must never fail the create; the honest outcome rides the response.
    const organizer = await getOrganizerInfo(prisma, userId);
    const guestNotification =
      parsed.data.sendInvites === false
        ? { notified: false, count: 0, reason: 'declined' as const }
        : await notifyEventGuests(created, organizer, 'creation', request);
    return reply.status(201).send({ success: true, data: { ...toEventDto(created), guestNotification } });
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

    // Gmail parity (fix/qm-calendar-event-guest-notify): guests are emailed a
    // METHOD:REQUEST update only when the client passes sendUpdate: true (the
    // UI asks "Send update to guests?" before saving). Occurrence-level edits
    // report not-wired honestly — ICS RECURRENCE-ID support isn't there yet.
    const maybeNotifyOnUpdate = async (row: EventRow): Promise<GuestNotificationStatus> => {
      if (parsed.data.sendUpdate !== true)
        return { notified: false, count: 0, reason: 'not-requested' };
      const organizer = await getOrganizerInfo(prisma, userId);
      return notifyEventGuests(row, organizer, 'update', request);
    };

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

      if (scope === 'all') {
        const updateData: Record<string, unknown> = { updatedAt: new Date() };
        for (const key of ['title', 'description', 'allDay', 'location', 'status'] as const) {
          if (parsed.data[key] !== undefined) updateData[key] = parsed.data[key];
        }
        if (parsed.data.driveLink !== undefined) {
          updateData.description = setMetaDriveLink(
            (updateData.description as string | undefined) ?? parent.description ?? '',
            parsed.data.driveLink,
          );
        } else if (typeof updateData.description === 'string') {
          updateData.description = preserveMetaHeader(
            updateData.description,
            parent.description ?? '',
          );
        }
        // fix/qm-period-log-silent-drop-2: fold the sheet's top-level
        // period/birthday fields into the stored __QUANT_META__ header (a
        // no-op when the payload carries none, so unrelated saves keep their
        // description byte-identical).
        {
          const sheetPatched = sheetMetaPatch(parsed.data);
          if (sheetPatched) {
            const base =
              typeof updateData.description === 'string'
                ? updateData.description
                : ((parent.description as string | undefined) ?? '');
            updateData.description = setMetaSheetFields(base, sheetPatched);
          }
        }
        if (parsed.data.calendarId !== undefined) updateData.calendarId = parsed.data.calendarId;
        const tzToUpdate = parsed.data.timeZone ?? (parsed.data as any).timezone;
        if (tzToUpdate !== undefined) updateData.timeZone = tzToUpdate;
        if (start) updateData.startTime = start;
        if (end) updateData.endTime = end;
        if (parsed.data.attendees !== undefined)
          updateData.attendees = JSON.stringify(toStoredAttendees(parsed.data.attendees));
        if (parsed.data.reminders !== undefined)
          updateData.reminders = JSON.stringify(toStoredReminders(parsed.data.reminders));
        const recurrence = pickRecurrence(parsed.data);
        if (recurrence !== undefined)
          updateData.recurrenceRule = normalizeRecurrenceRule(recurrence, recurringService);

        const updatedMaster = (await prisma.event.update({
          where: { id: parentId },
          data: updateData,
        })) as EventRow;

        return reply.send({
          success: true,
          data: { ...toEventDto(updatedMaster), guestNotification: await maybeNotifyOnUpdate(updatedMaster) },
        });
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
          // fix/qm-period-log-silent-drop-2: same __QUANT_META__ fold as the
          // create path — the sheet's top-level period/birthday fields must
          // not be dropped on a series split either.
          description: applySheetMeta(
            parsed.data.driveLink !== undefined
              ? setMetaDriveLink(
                  parsed.data.description ?? parent.description ?? '',
                  parsed.data.driveLink,
                )
              : (parsed.data.description ?? parent.description ?? ''),
            parsed.data,
          ),
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

        return reply.status(200).send({
          success: true,
          data: { ...toEventDto(newSeries), guestNotification: await maybeNotifyOnUpdate(newSeries) },
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

      const metaObj = {
        recurrenceParentId: parentId,
        originalStartTime: occDate.toISOString(),
      };
      const metaHeader = `__QUANT_META__:${JSON.stringify(metaObj)}:__END_QUANT_META__\n`;
      const userDesc = parsed.data.description ?? parent.description ?? '';
      let finalDesc =
        metaHeader + stripQuantMeta(userDesc).trim();
      if (parsed.data.driveLink !== undefined) {
        finalDesc = setMetaDriveLink(finalDesc, parsed.data.driveLink);
      }
      // fix/qm-period-log-silent-drop-2: the occurrence edit sheet sends the
      // same top-level period/birthday fields — fold them into the new
      // child's __QUANT_META__ header as well.
      finalDesc = applySheetMeta(finalDesc, parsed.data);

      const now = new Date();
      const createPayload: Record<string, unknown> = {
        title: parsed.data.title ?? parent.title,
        description: finalDesc,
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

      (created as any).recurrenceParentId = parentId;
      (created as any).originalStartTime = occDate;

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

      return reply.send({
        success: true,
        data: { ...toEventDto(created), guestNotification: OCCURRENCE_NOTIFY_NOT_WIRED },
      });
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
    if (parsed.data.driveLink !== undefined) {
      // The sheet always sends the field; merge it into the stored
      // __QUANT_META__ header (clearing included) instead of dropping it.
      data.description = setMetaDriveLink(
        (data.description as string | undefined) ?? (existing.description as string) ?? '',
        parsed.data.driveLink,
      );
    } else if (typeof data.description === 'string') {
      // Screens that save a meta-stripped description (event detail page)
      // must not wipe the stored header as a side effect.
      data.description = preserveMetaHeader(
        data.description,
        (existing.description as string) ?? '',
      );
    }
    // fix/qm-period-log-silent-drop-2: fold the sheet's top-level
    // period/birthday fields into the stored __QUANT_META__ header (a
    // no-op when the payload carries none, so unrelated saves keep their
    // description byte-identical).
    {
      const sheetPatched = sheetMetaPatch(parsed.data);
      if (sheetPatched) {
        const base =
          typeof data.description === 'string'
            ? data.description
            : ((existing.description as string | undefined) ?? '');
        data.description = setMetaSheetFields(base, sheetPatched);
      }
    }
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
    return reply.send({
      success: true,
      data: { ...toEventDto(updated), guestNotification: await maybeNotifyOnUpdate(updated) },
    });
  };
  fastify.put('/events/:id', updateEvent);
  fastify.patch('/events/:id', updateEvent);
  fastify.delete<{ Params: { id: string } }>('/events/:id', async (request: any, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);

    // Gmail parity (fix/qm-calendar-event-guest-notify): cancelling an event
    // with guests sends them a real METHOD:CANCEL email. The client opts out
    // with notifyGuests=false (the delete dialog's "Notify guests" checkbox).
    // The notification never fails the delete — its honest outcome lands in
    // the response as guestNotification.
    const notifyFlag = request.query?.notifyGuests ?? request.body?.notifyGuests;
    const notifyGuestsRequested = notifyFlag !== false && notifyFlag !== 'false';
    const maybeNotifyOnDelete = async (row: EventRow): Promise<GuestNotificationStatus> => {
      if (!notifyGuestsRequested) return { notified: false, count: 0, reason: 'declined' };
      const organizer = await getOrganizerInfo(prisma, userId);
      return notifyEventGuests(row, organizer, 'cancellation', request);
    };

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
      if (scope === 'all') {
        await prisma.event.delete({ where: { id: parentId } });
        await callAlertService.cancelAlertsForEvent(parentId).catch((err) => {
          request.log.warn({ err }, 'Failed to schedule event call alert');
        });
        return reply.send({
          success: true,
          data: {
            message: 'All events in series deleted',
            guestNotification: await maybeNotifyOnDelete(parent as EventRow),
          },
        });
      }

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
          data: {
            message: 'This and following occurrences deleted',
            until,
            guestNotification: OCCURRENCE_NOTIFY_NOT_WIRED,
          },
        });
      }

      await recurringService.deleteOccurrence(parentId, occDate, userId);

      return reply.send({
        success: true,
        data: {
          message: 'Occurrence deleted from series',
          excludedDate: occurrenceIso,
          guestNotification: OCCURRENCE_NOTIFY_NOT_WIRED,
        },
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
    return reply.send({
      success: true,
      data: {
        message: 'Event deleted',
        guestNotification: await maybeNotifyOnDelete(event as EventRow),
      },
    });
  });
  fastify.post<{ Params: { id: string } }>('/events/:id/rsvp', async (request, reply) => {
    const parsed = rsvpSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    // Occurrence ids are <parentId>_<iso>: occurrences are virtual rows, so the
    // RSVP lands on the parent's (series-level) attendee list — same as
    // DELETE /events/:id. The v1 occurrence-vs-series contract
    // (docs/quant-architecture/products/quantmail/backend/calendar-rsvp-occurrence-contract.md)
    // keeps this scope; the response below reports it so the UI can confirm
    // honestly what the RSVP covered instead of implying a per-occurrence write.
    const { parentId: eventId, occurrenceIso } = splitEventId(request.params.id);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const email = String(user?.email ?? '').toLowerCase();
    const { updated, attendees, recurrenceRule, rsvpGuest } = await prisma.$transaction(
      async (tx: any) => {
      // The attendee list is a JSON column written read-modify-write: without
      // a row lock, two simultaneous RSVPs both read the same list and the
      // second write silently drops the first attendee's response. SELECT ...
      // FOR UPDATE serializes concurrent writes on this event row inside the
      // transaction, so no RSVP is ever lost.
      await tx.$queryRaw`SELECT "id" FROM "calendar_events" WHERE "id" = ${eventId} FOR UPDATE`;
      const event = await tx.event.findUnique({ where: { id: eventId } });
      if (!event) throw createAppError('Event not found', 404, 'EVENT_NOT_FOUND');
      let matched = false;
      let matchedGuest: StoredAttendee | null = null;
      const next = toStoredAttendees(parseJsonArray(event.attendees) as AttendeeInput[]).map(
        (attendee) => {
          if (attendee.userId !== userId && attendee.email.toLowerCase() !== email) return attendee;
          matched = true;
          const withStatus = {
            ...attendee,
            userId: attendee.userId || userId,
            status: parsed.data.status,
          };
          matchedGuest = withStatus;
          return withStatus;
        },
      );
      if (!matched)
        throw createAppError('The authenticated user is not an attendee', 403, 'NOT_EVENT_ATTENDEE');
      const saved = await tx.event.update({
        where: { id: eventId },
        data: { attendees: JSON.stringify(next), updatedAt: new Date() },
      });
      return {
        updated: saved,
        attendees: next,
        recurrenceRule: event.recurrenceRule,
        rsvpGuest: matchedGuest,
      };
      },
    );
    const appliesTo = recurrenceRule ? 'series' : 'event';
    // Gmail parity (fix/qm-calendar-rsvp-organizer-notify): the guest's
    // response landed — now tell the organizer by real email. Runs after the
    // write and never throws: a mail outage must not fail the RSVP itself;
    // the honest outcome rides in the response as rsvpNotification.
    const rsvpNotification = await notifyOrganizerOfRsvp(
      prisma,
      updated,
      rsvpGuest,
      parsed.data.status,
      userId,
      request,
    );
    return reply.send({
      success: true,
      data: {
        ...toEventDto(updated),
        attendees,
        rsvpScope: {
          kind: occurrenceIso ? 'occurrence' : 'event',
          appliesTo,
          fromOccurrence: occurrenceIso,
        },
        rsvpNotification,
      },
    });
  });

  const handleCreateBookingLink = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = bookingLinkSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    return reply.status(201).send({
      success: true,
      data: await bookingService().createBookingLink({
        ...parsed.data,
        userId: requireUserId(request),
      }),
    });
  };

  const handleListBookingLinks = async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = requireUserId(request);
    return reply.send({
      success: true,
      data: await bookingService().listBookings(userId),
    });
  };

  const handleDeleteBookingLink = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    const userId = requireUserId(request);
    await bookingService().deleteBookingLink(request.params.id, userId);
    return reply.send({ success: true, data: { message: 'Booking link deleted' } });
  };

  const handleGetBookingLink = async (
    request: FastifyRequest<{ Params: { slug: string } }>,
    reply: FastifyReply,
  ) => {
    return reply.send({
      success: true,
      // Public (unauthenticated) endpoint: serves the public DTO — the link
      // owner's internal userId is stripped (fix/qm-booking-link-public-dto).
      data: await bookingService().getPublicBookingLink(request.params.slug),
    });
  };

  const handleGetBookingSlots = async (
    request: FastifyRequest<{
      Params: { slug: string };
      Querystring: { date?: string; tz?: string };
    }>,
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
        request.query.tz,
      ),
    });
  };

  const handleLockSlot = async (
    request: FastifyRequest<{ Params: { slug: string } }>,
    reply: FastifyReply,
  ) => {
    const parsed = lockSlotSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const lock = await bookingService().lockSlot(
      request.params.slug,
      toDate(parsed.data.slot, 'slot'),
      parsed.data.email,
    );
    return reply.status(200).send({
      success: true,
      lockId: lock.lockId,
      expiresAt: lock.expiresAt,
      data: lock,
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
      parsed.data.lockId,
    );
    // Gmail parity (fix/qm-booking-host-email): the booking landed — now
    // tell the host by real email. Runs after the write and never throws: a
    // mail outage must not fail the booking; the honest outcome rides in the
    // response as hostNotification. The booker's 201 shape is unchanged
    // (event + icsContent + host identity, now plus hostNotification).
    const hostNotification = await notifyHostOfBooking(
      data,
      { name: parsed.data.name, email: parsed.data.email, notes: parsed.data.notes },
      request,
    );
    return reply.status(201).send({ success: true, data: { ...data, hostNotification } });
  };

  // Host authenticated routes (mounted before /:slug)
  fastify.post('/booking/links', handleCreateBookingLink);
  fastify.post('/calendar/booking/links', handleCreateBookingLink);
  fastify.get('/booking/links', handleListBookingLinks);
  fastify.get('/calendar/booking/links', handleListBookingLinks);
  fastify.delete<{ Params: { id: string } }>('/booking/links/:id', handleDeleteBookingLink);
  fastify.delete<{ Params: { id: string } }>(
    '/calendar/booking/links/:id',
    handleDeleteBookingLink,
  );

  // Public booking link routes
  fastify.get<{ Params: { slug: string } }>('/booking/links/:slug', handleGetBookingLink);
  fastify.get<{ Params: { slug: string } }>('/calendar/booking/:slug', handleGetBookingLink);

  fastify.get<{ Params: { slug: string }; Querystring: { date?: string; tz?: string } }>(
    '/booking/links/:slug/slots',
    handleGetBookingSlots,
  );
  fastify.get<{ Params: { slug: string }; Querystring: { date?: string; tz?: string } }>(
    '/calendar/booking/:slug/slots',
    handleGetBookingSlots,
  );

  fastify.post<{ Params: { slug: string } }>('/booking/links/:slug/lock', handleLockSlot);
  fastify.post<{ Params: { slug: string } }>('/calendar/booking/:slug/lock', handleLockSlot);

  fastify.post<{ Params: { slug: string } }>('/booking/links/:slug/book', handlePostBooking);
  fastify.post<{ Params: { slug: string } }>('/calendar/booking/:slug/book', handlePostBooking);
}
