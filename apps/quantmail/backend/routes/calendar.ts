// ============================================================================
// QuantMail — Calendar routes (/events, /calendars) for the Calendar page.
// The page called /events and /calendars which did not exist ("Failed to load
// events"). Backed by the Event + Calendar Prisma models. Enveloped responses
// ({ success, data }) to match the api-client. Global auth hook → req.auth.
// ============================================================================
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';

function getPrisma(fastify: FastifyInstance): any {
  return (fastify as unknown as { prisma: unknown }).prisma;
}
function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  return userId;
}

// An attendee arrives from the calendar page as a bare email string and from
// anything typed against api-client's `CalendarEvent` as an object. Both are
// accepted for the same reason both date spellings are: one route, two clients.
// A reminder has a third spelling — a bare minute count.
//
// Every inner field is optional because the alternative is a 400 on the whole
// event save over one malformed row in a guest list. An entry the normalisers
// below cannot use is dropped there, where the loss costs one line instead of
// the user's edit.
const attendeeInput = z.union([
  z.string().max(320),
  z.object({ email: z.string().max(320).optional() }).passthrough(),
]);
const reminderInput = z.union([
  z.string().max(120),
  z.number(),
  z.object({ minutesBefore: z.number().optional() }).passthrough(),
]);

// `calendarId` has no column on Event — it is accepted so a client that sends
// one is not rejected, and then dropped. See the note on the model below.
const eventCollectionFields = {
  attendees: z.array(attendeeInput).max(200).optional(),
  reminders: z.array(reminderInput).max(50).optional(),
  recurrence: z.string().max(200).nullable().optional(),
  recurrenceRule: z.string().max(200).nullable().optional(),
  calendarId: z.string().optional(),
};

const eventCreateSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  start: z.string(),
  end: z.string().optional(),
  allDay: z.boolean().optional(),
  location: z.string().max(500).optional(),
  ...eventCollectionFields,
});

// Update is create with every field optional, plus the startTime/endTime
// spelling. api-client sends both spellings on purpose — quantcalendar
// validates startTime/endTime and this route validates start/end — so a
// payload that satisfies either service has to be accepted by both.
const eventUpdateSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  allDay: z.boolean().optional(),
  location: z.string().max(500).optional(),
  ...eventCollectionFields,
});

type AttendeeInput = z.infer<typeof attendeeInput>;
type ReminderInput = z.infer<typeof reminderInput>;

// An unparseable date reaches Prisma as `Invalid Date` and comes back as a 500,
// which tells the caller nothing. Reject it here as the 400 it is.
function toDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw createAppError(`\`${field}\` is not a valid date`, 400, 'INVALID_DATE');
  return date;
}

// ----------------------------------------------------------------------------
// attendees / reminders / recurrenceRule
//
// The page has always sent all three and this route used to drop all three, so
// an invite list survived until the sheet closed and no further.
//
// The columns are `String` holding JSON, and quantmail is not their only writer:
// apps/quantcalendar/backend/services/event.service.ts writes the same
// `calendar_events` table and defines the shape — `Attendee` is
// {userId,email,name,status} and `Reminder` is {type,minutesBefore}. Storing a
// bare `["ada@x.com"]` here would read back through that service as an attendee
// with no email and no userId, and its next RSVP write would flatten the row.
// So quantmail writes ITS shape, and adds one field: `label`, the exact string
// the user picked, because the calendar page's reminders are human phrases and a
// number alone cannot reproduce "1 week before at 9 AM".
// ----------------------------------------------------------------------------
type StoredAttendee = { userId: string; email: string; name: string; status: string };
type StoredReminder = { type: string; minutesBefore: number | null; label: string };

const REMINDER_UNIT_MINUTES: Record<string, number> = {
  minute: 1,
  hour: 60,
  day: 1440,
  week: 10080,
};

/**
 * '30 minutes before' → 30, '1 week before at 9 AM' → 10080, 'On the day at
 * 9 AM' → 0, anything else → null. Derived rather than looked up: the page owns
 * the label list (NOTIFICATION_SLIDER_VALUES) and a copy of that table here
 * would rot the first time someone adds a row to it. A label this parser does
 * not recognise still stores — with `minutesBefore: null` and its text intact.
 */
function minutesFromLabel(label: string): number | null {
  const relative = /^(\d+)\s+(minute|hour|day|week)s?\s+before/i.exec(label.trim());
  if (relative) {
    const unit = REMINDER_UNIT_MINUTES[relative[2]!.toLowerCase()];
    if (unit) return Number(relative[1]) * unit;
  }
  if (/^on the day/i.test(label.trim())) return 0;
  return null;
}

/** The inverse, for a reminder written by a service that stores only a number. */
function labelFromMinutes(minutes: number): string {
  if (minutes <= 0) return 'On the day';
  for (const unit of ['week', 'day', 'hour'] as const) {
    const size = REMINDER_UNIT_MINUTES[unit]!;
    if (minutes % size === 0) {
      const n = minutes / size;
      return `${n} ${unit}${n === 1 ? '' : 's'} before`;
    }
  }
  return `${minutes} minute${minutes === 1 ? '' : 's'} before`;
}

/** A JSON column that a legacy row may have left malformed. Never throws. */
function parseJsonArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // One unreadable row must not 500 a whole month of the calendar.
    return [];
  }
}

function toStoredAttendees(input: AttendeeInput[]): StoredAttendee[] {
  const seen = new Set<string>();
  const out: StoredAttendee[] = [];
  for (const entry of input) {
    const source = typeof entry === 'string' ? { email: entry } : entry;
    const email = String(source.email ?? '').trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      userId: typeof source['userId'] === 'string' ? source['userId'] : '',
      email,
      name: typeof source['name'] === 'string' ? source['name'] : '',
      // An email invite has not answered yet, and re-saving an event must not
      // reset somebody who already accepted.
      status: typeof source['status'] === 'string' ? source['status'] : 'pending',
    });
  }
  return out;
}

function toStoredReminders(input: ReminderInput[]): StoredReminder[] {
  const out: StoredReminder[] = [];
  for (const entry of input) {
    if (typeof entry === 'string') {
      const label = entry.trim();
      if (!label) continue;
      // 'push' and not 'call': the page's notification slider is not asking for
      // a phone call, and quantcalendar's alarm service only rings on 'call'.
      out.push({ type: 'push', minutesBefore: minutesFromLabel(label), label });
      continue;
    }
    if (typeof entry === 'number') {
      if (!Number.isFinite(entry)) continue;
      out.push({ type: 'push', minutesBefore: entry, label: labelFromMinutes(entry) });
      continue;
    }
    const type = typeof entry['type'] === 'string' ? entry['type'] : 'push';
    const explicitLabel = typeof entry['label'] === 'string' ? entry['label'].trim() : '';
    const minutes = Number(entry.minutesBefore);
    if (!Number.isFinite(minutes)) {
      // An object carrying only a label is still a reminder the user chose.
      if (!explicitLabel) continue;
      out.push({ type, minutesBefore: minutesFromLabel(explicitLabel), label: explicitLabel });
      continue;
    }
    out.push({ type, minutesBefore: minutes, label: explicitLabel || labelFromMinutes(minutes) });
  }
  return out;
}

/** The page renders emails; `CalendarEventLike` declares `attendees?: string[]`. */
function attendeeEmails(raw: unknown): string[] {
  return parseJsonArray(raw)
    .map((entry) =>
      typeof entry === 'string' ? entry : String((entry as { email?: unknown })?.email ?? ''),
    )
    .filter((email) => email !== '');
}

function reminderLabels(raw: unknown): string[] {
  return parseJsonArray(raw)
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (typeof entry === 'number') return labelFromMinutes(entry);
      const row = entry as { label?: unknown; minutesBefore?: unknown };
      if (typeof row?.label === 'string' && row.label !== '') return row.label;
      const minutes = Number(row?.minutesBefore);
      return Number.isFinite(minutes) ? labelFromMinutes(minutes) : '';
    })
    .filter((label) => label !== '');
}

// 'Does not repeat' is the page's way of saying "no rule", and a sentinel string
// in a nullable column is how `WHERE recurrenceRule IS NOT NULL` starts lying.
function toRecurrenceRule(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '' || /^(none|does not repeat)$/i.test(trimmed)) return null;
  return trimmed;
}

/**
 * The page sends `recurrence`; the column is called `recurrenceRule`; either may
 * be `null` to clear it. Returns `undefined` only when the client mentioned
 * neither, which is how the update route tells "clear this" from "leave it".
 */
function pickRecurrence(data: {
  recurrence?: string | null;
  recurrenceRule?: string | null;
}): string | null | undefined {
  return data.recurrence !== undefined ? data.recurrence : data.recurrenceRule;
}

type EventRow = {
  id: string;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  allDay: boolean;
  location: string;
  status: string;
  attendees?: unknown;
  reminders?: unknown;
  recurrenceRule?: string | null;
};

function toEventDto(e: EventRow) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    start: e.startTime,
    end: e.endTime,
    startTime: e.startTime,
    endTime: e.endTime,
    allDay: e.allDay,
    location: e.location,
    status: e.status,
    attendees: attendeeEmails(e.attendees),
    reminders: reminderLabels(e.reminders),
    // Null, not 'Does not repeat': the page already falls back to that label,
    // and the DTO should not invent a rule the row does not have.
    recurrence: e.recurrenceRule ?? null,
  };
}

export default async function calendarRoutes(fastify: FastifyInstance) {
  // GET /calendars — the user's calendars (auto-provision a primary one).
  fastify.get('/calendars', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    let calendars = await prisma.calendar.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    if (!calendars || calendars.length === 0) {
      const primary = await prisma.calendar.create({
        data: { userId, name: 'My Calendar', color: '#4F46E5', isPrimary: true },
      });
      calendars = [primary];
    }
    return reply.send({ success: true, data: calendars });
  });

  // GET /events — events for the signed-in user, optional [start,end] window.
  fastify.get<{ Querystring: { start?: string; end?: string; calendarId?: string } }>(
    '/events',
    async (request, reply) => {
      const userId = requireUserId(request);
      const prisma = getPrisma(fastify);
      const where: Record<string, unknown> = { userId };
      const { start, end } = request.query;
      if (start || end) {
        // Same rule as the bodies: a bad window is a bad request, not a 500 out
        // of the query engine. The grid sends this on every month change.
        where.startTime = {
          ...(start ? { gte: toDate(start, 'start') } : {}),
          ...(end ? { lte: toDate(end, 'end') } : {}),
        };
      }
      const rows = (await prisma.event.findMany({
        where,
        orderBy: { startTime: 'asc' },
        take: 1000,
      })) as EventRow[];
      return reply.send({ success: true, data: rows.map(toEventDto) });
    },
  );

  // GET /events/today — events whose start falls within the current day.
  fastify.get('/events/today', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const rows = (await prisma.event.findMany({
      where: { userId, startTime: { gte: startOfDay, lt: endOfDay } },
      orderBy: { startTime: 'asc' },
      take: 200,
    })) as EventRow[];
    return reply.send({ success: true, data: rows.map(toEventDto) });
  });

  // GET /events/upcoming — the next N events from now onward.
  fastify.get<{ Querystring: { limit?: string } }>('/events/upcoming', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const limit = Math.min(Math.max(Number(request.query.limit) || 10, 1), 100);
    const rows = (await prisma.event.findMany({
      where: { userId, startTime: { gte: new Date() } },
      orderBy: { startTime: 'asc' },
      take: limit,
    })) as EventRow[];
    return reply.send({ success: true, data: rows.map(toEventDto) });
  });

  // GET /events/:id — one event, owner only. Registered after the static
  // /events/today and /events/upcoming routes, which find-my-way matches ahead
  // of a parametric segment, so neither is shadowed by this.
  fastify.get<{ Params: { id: string } }>('/events/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const ev = (await prisma.event.findUnique({ where: { id: request.params.id } })) as
      | (EventRow & { userId: string })
      | null;
    if (!ev || ev.userId !== userId)
      throw createAppError('Event not found', 404, 'EVENT_NOT_FOUND');
    return reply.send({ success: true, data: toEventDto(ev) });
  });

  // POST /events — create an event.
  fastify.post('/events', async (request, reply) => {
    const parsed = eventCreateSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const now = new Date();
    const start = toDate(parsed.data.start, 'start');
    const end = parsed.data.end
      ? toDate(parsed.data.end, 'end')
      : new Date(start.getTime() + 3600_000);
    const created = (await prisma.event.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description ?? '',
        startTime: start,
        endTime: end,
        allDay: parsed.data.allDay ?? false,
        location: parsed.data.location ?? '',
        userId,
        status: 'confirmed',
        // Written on every create, not only when sent: the columns are
        // `String @default("[]")`, and a row that came through this route should
        // read back the same way whether or not the client had an invite list.
        attendees: JSON.stringify(toStoredAttendees(parsed.data.attendees ?? [])),
        reminders: JSON.stringify(toStoredReminders(parsed.data.reminders ?? [])),
        recurrenceRule: toRecurrenceRule(pickRecurrence(parsed.data)),
        createdAt: now,
        updatedAt: now,
      },
    })) as EventRow;
    return reply.status(201).send({ success: true, data: toEventDto(created) });
  });

  // PUT /events/:id — edit an event (owner only). The calendar page's edit sheet
  // has always called this through api-client's `updateEvent`; without it the
  // request reached the allow-list, passed, and 404'd here, so saving an edit
  // failed while creating the same entry worked.
  fastify.put<{ Params: { id: string } }>('/events/:id', async (request, reply) => {
    const parsed = eventUpdateSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const ev = await prisma.event.findUnique({ where: { id: request.params.id } });
    if (!ev || ev.userId !== userId)
      throw createAppError('Event not found', 404, 'EVENT_NOT_FOUND');

    const { title, description, allDay, location } = parsed.data;
    const startRaw = parsed.data.start ?? parsed.data.startTime;
    const endRaw = parsed.data.end ?? parsed.data.endTime;
    const start = startRaw ? toDate(startRaw, 'start') : undefined;
    const end = endRaw ? toDate(endRaw, 'end') : undefined;
    if (start && end && end.getTime() < start.getTime())
      throw createAppError('`end` cannot be before `start`', 400, 'INVALID_RANGE');

    // `updatedAt` has no @updatedAt attribute in the schema, so Prisma will not
    // touch it on its own — the create route sets it by hand and so must this.
    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (allDay !== undefined) data.allDay = allDay;
    if (location !== undefined) data.location = location;
    if (start) data.startTime = start;
    if (end) data.endTime = end;

    // Absent means "leave the column alone"; an empty array means "clear it".
    // The edit sheet re-sends the whole list every save, so a removed guest has
    // to be a write of the shorter list and not a no-op.
    if (parsed.data.attendees !== undefined)
      data.attendees = JSON.stringify(toStoredAttendees(parsed.data.attendees));
    if (parsed.data.reminders !== undefined)
      data.reminders = JSON.stringify(toStoredReminders(parsed.data.reminders));
    const recurrence = pickRecurrence(parsed.data);
    if (recurrence !== undefined) data.recurrenceRule = toRecurrenceRule(recurrence);

    const updated = (await prisma.event.update({
      where: { id: request.params.id },
      data,
    })) as EventRow;
    return reply.send({ success: true, data: toEventDto(updated) });
  });

  // DELETE /events/:id — remove an event (owner only).
  fastify.delete<{ Params: { id: string } }>('/events/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const ev = await prisma.event.findUnique({ where: { id: request.params.id } });
    if (!ev || ev.userId !== userId)
      throw createAppError('Event not found', 404, 'EVENT_NOT_FOUND');
    await prisma.event.delete({ where: { id: request.params.id } });
    return reply.send({ success: true, data: { message: 'Event deleted' } });
  });
}
