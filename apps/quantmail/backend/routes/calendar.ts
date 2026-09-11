import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { CalendarService } from '../services/calendar.service';
import { AlarmService, type AlarmEvent } from '../services/alarm.service';
import { BookingLinkService } from '../services/booking-link.service';
import { RecurringService, type CalendarEvent } from '../services/recurring.service';

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

const attendeeInput = z.union([z.string().max(320), z.object({ email: z.string().max(320).optional() }).passthrough()]);
const reminderInput = z.union([z.string().max(120), z.number(), z.object({ minutesBefore: z.number().optional() }).passthrough()]);
const eventCollectionFields = {
  attendees: z.array(attendeeInput).max(200).optional(), reminders: z.array(reminderInput).max(50).optional(),
  recurrence: z.string().max(200).nullable().optional(), recurrenceRule: z.string().max(200).nullable().optional(),
  calendarId: z.string().optional(),
};
const eventCreateSchema = z.object({
  title: z.string().min(1).max(300), description: z.string().max(5000).optional(), start: z.string(),
  end: z.string().optional(), allDay: z.boolean().optional(), location: z.string().max(500).optional(),
  ...eventCollectionFields,
});
const eventUpdateSchema = z.object({
  title: z.string().min(1).max(300).optional(), description: z.string().max(5000).optional(),
  start: z.string().optional(), end: z.string().optional(), startTime: z.string().optional(),
  endTime: z.string().optional(), allDay: z.boolean().optional(), location: z.string().max(500).optional(),
  status: z.enum(['confirmed', 'tentative', 'cancelled']).optional(), ...eventCollectionFields,
});
const calendarCreateSchema = z.object({ name: z.string().min(1).max(200), color: z.string().max(32).optional() });
const calendarUpdateSchema = z.object({ name: z.string().min(1).max(200).optional(), color: z.string().max(32).optional() })
  .refine((value) => value.name !== undefined || value.color !== undefined, { message: 'At least one of name or color must be provided' });
const rsvpSchema = z.object({ status: z.enum(['accepted', 'declined', 'tentative', 'pending']) });
const bookingLinkSchema = z.object({
  slug: z.string().min(1).max(100), title: z.string().min(1).max(255), description: z.string().optional(),
  duration: z.number().int().min(5).max(480), availableDays: z.array(z.number().int().min(0).max(6)).optional(),
  startHour: z.number().int().min(0).max(23).optional(), endHour: z.number().int().min(1).max(24).optional(),
});
const confirmBookingSchema = z.object({ slot: z.string(), name: z.string().min(1), email: z.string().email(), notes: z.string().optional() });

type AttendeeInput = z.infer<typeof attendeeInput>;
type ReminderInput = z.infer<typeof reminderInput>;
type StoredAttendee = { userId: string; email: string; name: string; status: string };
type StoredReminder = { type: string; minutesBefore: number | null; label: string };
type EventRow = {
  id: string; title: string; description: string; startTime: Date; endTime: Date; allDay: boolean;
  location: string; userId: string; status: string; attendees?: unknown; reminders?: unknown;
  recurrenceRule?: string | null; createdAt: Date; updatedAt: Date;
};
const REMINDER_UNIT_MINUTES: Record<string, number> = { minute: 1, hour: 60, day: 1440, week: 10080 };

function toDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw createAppError(`\`${field}\` is not a valid date`, 400, 'INVALID_DATE');
  return date;
}
function parseJsonArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  try { const parsed: unknown = JSON.parse(raw); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
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
    if (minutes % size === 0) { const count = minutes / size; return `${count} ${unit}${count === 1 ? '' : 's'} before`; }
  }
  return `${minutes} minute${minutes === 1 ? '' : 's'} before`;
}
function toStoredAttendees(input: AttendeeInput[]): StoredAttendee[] {
  const seen = new Set<string>(); const result: StoredAttendee[] = [];
  for (const entry of input) {
    const source = typeof entry === 'string' ? { email: entry } : entry; const email = String(source.email ?? '').trim();
    if (!email || seen.has(email.toLowerCase())) continue; seen.add(email.toLowerCase());
    result.push({ userId: typeof source['userId'] === 'string' ? source['userId'] : '', email,
      name: typeof source['name'] === 'string' ? source['name'] : '', status: typeof source['status'] === 'string' ? source['status'] : 'pending' });
  }
  return result;
}
function toStoredReminders(input: ReminderInput[]): StoredReminder[] {
  const result: StoredReminder[] = [];
  for (const entry of input) {
    if (typeof entry === 'string') { const label = entry.trim(); if (label) result.push({ type: 'push', minutesBefore: minutesFromLabel(label), label }); continue; }
    if (typeof entry === 'number') { if (Number.isFinite(entry)) result.push({ type: 'push', minutesBefore: entry, label: labelFromMinutes(entry) }); continue; }
    const type = typeof entry['type'] === 'string' ? entry['type'] : 'push';
    const label = typeof entry['label'] === 'string' ? entry['label'].trim() : ''; const minutes = Number(entry.minutesBefore);
    if (Number.isFinite(minutes)) result.push({ type, minutesBefore: minutes, label: label || labelFromMinutes(minutes) });
    else if (label) result.push({ type, minutesBefore: minutesFromLabel(label), label });
  }
  return result;
}
function attendeeEmails(raw: unknown): string[] {
  return parseJsonArray(raw).map((entry) => typeof entry === 'string' ? entry : String((entry as { email?: unknown })?.email ?? '')).filter(Boolean);
}
function reminderLabels(raw: unknown): string[] {
  return parseJsonArray(raw).map((entry) => {
    if (typeof entry === 'string') return entry; if (typeof entry === 'number') return labelFromMinutes(entry);
    const reminder = entry as { label?: unknown; minutesBefore?: unknown };
    if (typeof reminder?.label === 'string' && reminder.label) return reminder.label;
    const minutes = Number(reminder?.minutesBefore); return Number.isFinite(minutes) ? labelFromMinutes(minutes) : '';
  }).filter(Boolean);
}
function alarmReminders(raw: unknown): AlarmEvent['reminders'] {
  return parseJsonArray(raw).flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []; const reminder = entry as { type?: unknown; minutesBefore?: unknown };
    const minutesBefore = Number(reminder.minutesBefore);
    return typeof reminder.type === 'string' && Number.isFinite(minutesBefore) ? [{ type: reminder.type, minutesBefore }] : [];
  });
}
function normalizeRecurrenceRule(value: string | null | undefined, recurringService: RecurringService): string | null {
  if (value === null || value === undefined) return null; const trimmed = value.trim();
  if (trimmed === '' || /^(none|does not repeat)$/i.test(trimmed)) return null;
  return recurringService.serializeRRule(recurringService.parseRRule(trimmed));
}
function pickRecurrence(data: { recurrence?: string | null; recurrenceRule?: string | null }): string | null | undefined {
  return data.recurrence !== undefined ? data.recurrence : data.recurrenceRule;
}
function toCalendarEvent(row: EventRow): CalendarEvent {
  return { id: row.id, title: row.title, description: row.description ?? '', startTime: new Date(row.startTime),
    endTime: new Date(row.endTime), allDay: row.allDay ?? false, location: row.location ?? '', userId: row.userId,
    attendees: parseJsonArray(row.attendees), recurrenceRule: row.recurrenceRule ?? null,
    status: row.status as CalendarEvent['status'], reminders: parseJsonArray(row.reminders),
    createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt) };
}
function toEventDto(event: EventRow | CalendarEvent) {
  return {
    id: event.id,
    parentId: (event as CalendarEvent).parentId ?? (event.id.includes('_') ? event.id.split('_')[0] : event.id),
    title: event.title, description: event.description, start: event.startTime, end: event.endTime,
    startTime: event.startTime, endTime: event.endTime, allDay: event.allDay, location: event.location,
    status: event.status, attendees: attendeeEmails(event.attendees), reminders: reminderLabels(event.reminders),
    recurrence: event.recurrenceRule ?? null,
  };
}

export default async function calendarRoutes(fastify: FastifyInstance) {
  const calendarService = () => new CalendarService(getPrisma(fastify));
  const bookingService = () => new BookingLinkService(getPrisma(fastify));
  const recurringService = new RecurringService(getPrisma(fastify));

  fastify.get('/calendars', async (request, reply) => reply.send({ success: true, data: await calendarService().listCalendars(requireUserId(request)) }));
  fastify.post('/calendars', async (request, reply) => {
    const parsed = calendarCreateSchema.safeParse(request.body); if (!parsed.success) throw parsed.error;
    return reply.status(201).send({ success: true, data: await calendarService().createCalendar(requireUserId(request), parsed.data) });
  });
  fastify.put<{ Params: { id: string } }>('/calendars/:id', async (request, reply) => {
    const parsed = calendarUpdateSchema.safeParse(request.body); if (!parsed.success) throw parsed.error;
    return reply.send({ success: true, data: await calendarService().updateCalendar(requireUserId(request), request.params.id, parsed.data) });
  });
  fastify.delete<{ Params: { id: string } }>('/calendars/:id', async (request, reply) => reply.send({ success: true, data: await calendarService().deleteCalendar(requireUserId(request), request.params.id) }));
  fastify.post<{ Params: { id: string } }>('/calendars/:id/primary', async (request, reply) => reply.send({ success: true, data: await calendarService().setPrimary(requireUserId(request), request.params.id) }));

  fastify.get<{ Querystring: { start?: string; end?: string; calendarId?: string } }>('/events', async (request, reply) => {
    const userId = requireUserId(request); const { start, end } = request.query;
    if (start && end) {
      const startDate = toDate(start, 'start'); const requestedEnd = toDate(end, 'end');
      if (requestedEnd < startDate) throw createAppError('`end` cannot be before `start`', 400, 'INVALID_RANGE');
      const maxEnd = new Date(startDate.getTime() + MAX_EVENT_WINDOW_MS);
      const endDate = requestedEnd > maxEnd ? maxEnd : requestedEnd;
      const rows = await getPrisma(fastify).event.findMany({
        where: { userId, recurrenceRule: null, startTime: { gte: startDate, lte: endDate } },
        orderBy: { startTime: 'asc' }, take: 1000,
      }) as EventRow[];
      const recurringRows = await getPrisma(fastify).event.findMany({
        where: { userId, recurrenceRule: { not: null }, startTime: { lte: endDate } }, take: 200,
      }) as EventRow[];
      const expandedDtos = recurringRows.flatMap((row) => {
        try {
          return recurringService.expandOccurrences(toCalendarEvent(row), startDate, endDate)
            .filter((occurrence) => occurrence.startTime <= endDate && occurrence.endTime >= startDate)
            .map(toEventDto);
        } catch (error) {
          console.warn(`Unable to expand recurring calendar event ${row.id}`, error);
          return [];
        }
      });
      const merged = [...rows.map(toEventDto), ...expandedDtos];
      const data = [...new Map(merged.map((event) => [event.id, event])).values()]
        .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime());
      return reply.send({ success: true, data });
    }
    const where: Record<string, unknown> = { userId };
    if (start || end) where.startTime = { ...(start ? { gte: toDate(start, 'start') } : {}), ...(end ? { lte: toDate(end, 'end') } : {}) };
    const rows = await getPrisma(fastify).event.findMany({ where, orderBy: { startTime: 'asc' }, take: 1000 }) as EventRow[];
    return reply.send({ success: true, data: rows.map(toEventDto) });
  });
  fastify.get('/events/today', async (request, reply) => {
    const now = new Date(); const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const rows = await getPrisma(fastify).event.findMany({ where: { userId: requireUserId(request), startTime: { gte: startOfDay, lt: endOfDay } }, orderBy: { startTime: 'asc' }, take: 200 }) as EventRow[];
    return reply.send({ success: true, data: rows.map(toEventDto) });
  });
  fastify.get<{ Querystring: { limit?: string } }>('/events/upcoming', async (request, reply) => {
    const limit = Math.min(Math.max(Number(request.query.limit) || 10, 1), 100);
    const rows = await getPrisma(fastify).event.findMany({ where: { userId: requireUserId(request), startTime: { gte: new Date() } }, orderBy: { startTime: 'asc' }, take: limit }) as EventRow[];
    return reply.send({ success: true, data: rows.map(toEventDto) });
  });
  fastify.get('/events/alarms/due', async (request, reply) => {
    const userId = requireUserId(request); const alarms = new AlarmService(); const now = new Date(); const { start, end } = alarms.fetchWindow(now);
    const rows = await getPrisma(fastify).event.findMany({ where: { userId, startTime: { lt: end }, endTime: { gt: start } }, orderBy: { startTime: 'asc' } }) as EventRow[];
    const events: AlarmEvent[] = rows.map((event) => ({ id: event.id, title: event.title, startTime: event.startTime, status: event.status, reminders: alarmReminders(event.reminders) }));
    return reply.send({ success: true, data: alarms.getDueCallAlarms(events, now) });
  });
  fastify.get<{ Params: { id: string } }>('/events/:id', async (request, reply) => {
    const userId = requireUserId(request); const event = await getPrisma(fastify).event.findUnique({ where: { id: request.params.id } });
    if (!event || event.userId !== userId) throw createAppError('Event not found', 404, 'EVENT_NOT_FOUND');
    return reply.send({ success: true, data: toEventDto(event as EventRow) });
  });
  fastify.post('/events', async (request, reply) => {
    const parsed = eventCreateSchema.safeParse(request.body); if (!parsed.success) throw parsed.error;
    const start = toDate(parsed.data.start, 'start'); const end = parsed.data.end ? toDate(parsed.data.end, 'end') : new Date(start.getTime() + 3_600_000);
    if (end < start) throw createAppError('`end` cannot be before `start`', 400, 'INVALID_RANGE');
    const now = new Date(); const recurrence = pickRecurrence(parsed.data);
    const created = await getPrisma(fastify).event.create({ data: {
      title: parsed.data.title, description: parsed.data.description ?? '', startTime: start, endTime: end,
      allDay: parsed.data.allDay ?? false, location: parsed.data.location ?? '', userId: requireUserId(request), status: 'confirmed',
      attendees: JSON.stringify(toStoredAttendees(parsed.data.attendees ?? [])), reminders: JSON.stringify(toStoredReminders(parsed.data.reminders ?? [])),
      recurrenceRule: normalizeRecurrenceRule(recurrence, recurringService), createdAt: now, updatedAt: now,
    } }) as EventRow;
    return reply.status(201).send({ success: true, data: toEventDto(created) });
  });

  const updateEvent = async (request: any, reply: any) => {
    const parsed = eventUpdateSchema.safeParse(request.body); if (!parsed.success) throw parsed.error;
    const userId = requireUserId(request); const prisma = getPrisma(fastify); const eventId = parentEventId(request.params.id);
    const existing = await prisma.event.findUnique({ where: { id: eventId } });
    if (!existing || existing.userId !== userId) throw createAppError('Event not found', 404, 'EVENT_NOT_FOUND');
    const startRaw = parsed.data.start ?? parsed.data.startTime; const endRaw = parsed.data.end ?? parsed.data.endTime;
    const start = startRaw ? toDate(startRaw, 'start') : undefined; const end = endRaw ? toDate(endRaw, 'end') : undefined;
    if (start && end && end < start) throw createAppError('`end` cannot be before `start`', 400, 'INVALID_RANGE');
    const data: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ['title', 'description', 'allDay', 'location', 'status'] as const) if (parsed.data[key] !== undefined) data[key] = parsed.data[key];
    if (start) data.startTime = start; if (end) data.endTime = end;
    if (parsed.data.attendees !== undefined) data.attendees = JSON.stringify(toStoredAttendees(parsed.data.attendees));
    if (parsed.data.reminders !== undefined) data.reminders = JSON.stringify(toStoredReminders(parsed.data.reminders));
    const recurrence = pickRecurrence(parsed.data);
    if (recurrence !== undefined) data.recurrenceRule = normalizeRecurrenceRule(recurrence, recurringService);
    const updated = await prisma.event.update({ where: { id: eventId }, data }) as EventRow;
    return reply.send({ success: true, data: toEventDto(updated) });
  };
  fastify.put('/events/:id', updateEvent); fastify.patch('/events/:id', updateEvent);
  fastify.delete<{ Params: { id: string } }>('/events/:id', async (request, reply) => {
    const userId = requireUserId(request); const prisma = getPrisma(fastify); const eventId = parentEventId(request.params.id);
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event || event.userId !== userId) throw createAppError('Event not found', 404, 'EVENT_NOT_FOUND');
    await prisma.event.delete({ where: { id: eventId } });
    return reply.send({ success: true, data: { message: 'Event deleted' } });
  });
  fastify.post<{ Params: { id: string } }>('/events/:id/rsvp', async (request, reply) => {
    const parsed = rsvpSchema.safeParse(request.body); if (!parsed.success) throw parsed.error;
    const userId = requireUserId(request); const prisma = getPrisma(fastify); const event = await prisma.event.findUnique({ where: { id: request.params.id } });
    if (!event) throw createAppError('Event not found', 404, 'EVENT_NOT_FOUND');
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } }); const email = String(user?.email ?? '').toLowerCase(); let matched = false;
    const attendees = toStoredAttendees(parseJsonArray(event.attendees) as AttendeeInput[]).map((attendee) => {
      if (attendee.userId !== userId && attendee.email.toLowerCase() !== email) return attendee; matched = true;
      return { ...attendee, userId: attendee.userId || userId, status: parsed.data.status };
    });
    if (!matched) throw createAppError('The authenticated user is not an attendee', 403, 'NOT_EVENT_ATTENDEE');
    const updated = await prisma.event.update({ where: { id: request.params.id }, data: { attendees: JSON.stringify(attendees), updatedAt: new Date() } });
    return reply.send({ success: true, data: { ...toEventDto(updated), attendees } });
  });

  fastify.post('/booking/links', async (request, reply) => {
    const parsed = bookingLinkSchema.safeParse(request.body); if (!parsed.success) throw parsed.error;
    return reply.status(201).send({ success: true, data: await bookingService().createBookingLink({ ...parsed.data, userId: requireUserId(request) }) });
  });
  fastify.get<{ Params: { slug: string } }>('/booking/links/:slug', async (request, reply) => reply.send({ success: true, data: await bookingService().getBookingLink(request.params.slug) }));
  fastify.get<{ Params: { slug: string } }>('/calendar/booking/:slug', async (request, reply) => reply.send({ success: true, data: await bookingService().getBookingLink(request.params.slug) }));
  fastify.get<{ Params: { slug: string }; Querystring: { date?: string } }>('/booking/links/:slug/slots', async (request, reply) => {
    if (!request.query.date) throw createAppError('Date query parameter is required', 400, 'VALIDATION_FAILED');
    return reply.send({ success: true, data: await bookingService().getAvailableSlots(request.params.slug, toDate(request.query.date, 'date')) });
  });
  fastify.get<{ Params: { slug: string }; Querystring: { date?: string } }>('/calendar/booking/:slug/slots', async (request, reply) => {
    if (!request.query.date) throw createAppError('Date query parameter is required', 400, 'VALIDATION_FAILED');
    return reply.send({ success: true, data: await bookingService().getAvailableSlots(request.params.slug, toDate(request.query.date, 'date')) });
  });
  fastify.post<{ Params: { slug: string } }>('/booking/links/:slug/book', async (request, reply) => {
    const parsed = confirmBookingSchema.safeParse(request.body); if (!parsed.success) throw parsed.error;
    const data = await bookingService().confirmBooking(request.params.slug, toDate(parsed.data.slot, 'slot'), { name: parsed.data.name, email: parsed.data.email, notes: parsed.data.notes });
    return reply.status(201).send({ success: true, data });
  });
  fastify.post<{ Params: { slug: string } }>('/calendar/booking/:slug/book', async (request, reply) => {
    const parsed = confirmBookingSchema.safeParse(request.body); if (!parsed.success) throw parsed.error;
    const data = await bookingService().confirmBooking(request.params.slug, toDate(parsed.data.slot, 'slot'), { name: parsed.data.name, email: parsed.data.email, notes: parsed.data.notes });
    return reply.status(201).send({ success: true, data });
  });
}
