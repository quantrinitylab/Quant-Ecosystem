// ============================================================================
// Quanty agent — calendar tools ("hands" for the calendar)
// ============================================================================
//
// PURPOSE
//   Concrete, backend-backed tools the Quanty agent core invokes to act on
//   the user's calendar. This is the calendar counterpart of `mail-tools.ts`:
//   REAL implementations that reuse the existing `CalendarService` and the
//   same `prisma.event` rows the calendar routes read/write — no duplicated
//   business logic, no stubs.
//
//   Five tools:
//     Read-only : list_events, free_busy
//     Gated     : create_event, update_event, delete_event
//                 (destructive — the executor pauses for user confirmation
//                 before invoking)
//
// SAFETY INVARIANTS
//   * USER SCOPING — userId comes ONLY from `AssistantContext.userId`
//     (never from tool args). Every Prisma query is userId-scoped; cross-user
//     rows are rejected with 404/403, never touched.
//   * AUDIT — every invocation is logged (tool, userId, sanitized args,
//     success/failure) through the injectable `audit` port.
//   * NO FABRICATION — recurring series are reported as series (their
//     occurrences are NOT expanded here); missing rows and invalid dates
//     produce honest errors, never invented content.

import type { AITool, AIToolResult, AssistantContext } from '@quant/ai';
import { CalendarService } from '../../calendar.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** An AITool plus the safety metadata the agent runtime needs. */
export interface QuantyCalendarTool extends AITool {
  /** True when the tool changes user-visible state. */
  destructive: boolean;
  /** True when the change can be undone. */
  reversible: boolean;
  /** True when the runtime must ask the user before invoking. */
  requiresConfirmation: boolean;
}

/** One audit-trail entry per tool invocation. */
export interface CalendarAuditEntry {
  tool: string;
  userId: string;
  /** Args with long text truncated (never full bodies in logs). */
  args: Record<string, unknown>;
  success: boolean;
  at: string;
  error?: string;
}

/**
 * Minimal Prisma surface the calendar tools touch directly (injectable for
 * tests). Mirrors the `prisma.event` / `prisma.calendar` usage of the
 * calendar routes.
 */
export interface CalendarToolsPrisma {
  calendar: {
    findMany: (args: unknown) => Promise<any[]>;
    findFirst: (args: unknown) => Promise<any | null>;
    findUnique: (args: unknown) => Promise<any | null>;
    create: (args: unknown) => Promise<any>;
  };
  event: {
    findMany: (args: unknown) => Promise<any[]>;
    findUnique: (args: unknown) => Promise<any | null>;
    create: (args: unknown) => Promise<any>;
    update: (args: unknown) => Promise<any>;
    delete: (args: unknown) => Promise<any>;
  };
}

/** Dependencies injected by the caller (backend app wiring). */
export interface QuantyCalendarToolsDeps {
  prisma: CalendarToolsPrisma;
  calendarService: CalendarService;
  /** Optional — defaults to structured console logging. */
  audit?: (entry: CalendarAuditEntry) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const defaultAudit = (entry: CalendarAuditEntry): void => {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ns: 'quanty-calendar-tools', ...entry }));
};

/** Truncate long / sensitive arg values before they hit the audit log. */
function sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === 'string' && (k === 'description' || k === 'q') && v.length > 200) {
      out[k] = `${v.slice(0, 200)}…[truncated]`;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function strArg(args: Record<string, unknown>, name: string, required = true): string {
  const v = args[name];
  if (typeof v !== 'string' || v.length === 0) {
    if (required) throw new Error(`Missing required parameter: ${name}`);
    return '';
  }
  return v;
}

function optStr(args: Record<string, unknown>, name: string): string | undefined {
  const v = args[name];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function boolArg(args: Record<string, unknown>, name: string, fallback: boolean): boolean {
  const v = args[name];
  return typeof v === 'boolean' ? v : fallback;
}

function numArg(args: Record<string, unknown>, name: string, fallback: number): number {
  const v = args[name];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Parse an ISO 8601 timestamp arg, or throw an honest error. */
function dateArg(args: Record<string, unknown>, name: string, required = true): Date | null {
  const raw = strArg(args, name, required);
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid "${name}" timestamp — use ISO 8601, e.g. 2026-10-11T15:00:00Z.`);
  }
  return d;
}

/** Same 365-day window guard the calendar routes enforce. */
const MAX_EVENT_WINDOW_MS = 365 * 86_400_000;

function checkWindow(start: Date, end: Date): void {
  if (end < start) throw new Error('`end` cannot be before `start`.');
  if (end.getTime() - start.getTime() > MAX_EVENT_WINDOW_MS) {
    throw new Error('Event query window cannot exceed 365 days.');
  }
}

function parseAttendees(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const email = typeof entry === 'string' ? entry.trim() : typeof (entry as any)?.email === 'string' ? String((entry as any).email).trim() : '';
    if (!email || seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    out.push(email);
  }
  return out;
}

/** Stored attendee rows — same shape the calendar routes write. */
function toStoredAttendees(emails: string[]): Array<{ userId: string; email: string; name: string; status: string }> {
  return emails.map((email) => ({ userId: '', email, name: '', status: 'pending' }));
}

interface EventRowLike {
  id: string;
  calendarId?: string | null;
  title: string;
  description?: string | null;
  startTime: Date | string;
  endTime: Date | string;
  allDay?: boolean;
  location?: string | null;
  userId: string;
  status?: string | null;
  attendees?: unknown;
  recurrenceRule?: string | null;
  timeZone?: string | null;
}

function toEventSummary(row: EventRowLike): Record<string, unknown> {
  const start = row.startTime instanceof Date ? row.startTime : new Date(row.startTime);
  const end = row.endTime instanceof Date ? row.endTime : new Date(row.endTime);
  const attendees = Array.isArray(row.attendees)
    ? row.attendees
    : typeof row.attendees === 'string' && row.attendees.trim()
      ? (() => {
          try {
            const parsed: unknown = JSON.parse(row.attendees);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];
  return {
    id: row.id,
    title: row.title,
    startTime: Number.isNaN(start.getTime()) ? null : start.toISOString(),
    endTime: Number.isNaN(end.getTime()) ? null : end.toISOString(),
    allDay: row.allDay === true,
    location: row.location ?? '',
    description: row.description ?? '',
    status: row.status ?? 'confirmed',
    calendarId: row.calendarId ?? null,
    recurring: Boolean(row.recurrenceRule),
    recurrenceRule: row.recurrenceRule ?? null,
    attendees: attendees
      .map((a: any) => (typeof a === 'string' ? a : String(a?.email ?? '')).trim())
      .filter(Boolean),
    timeZone: row.timeZone ?? 'UTC',
  };
}

/**
 * Resolve a calendar id for writes: an explicit calendarId is verified
 * against the user's own calendars (404/403 otherwise); without one, the
 * primary calendar wins, then any of the user's calendars, then a new
 * "Primary" calendar — mirroring POST /events.
 */
async function resolveCalendarId(
  deps: QuantyCalendarToolsDeps,
  userId: string,
  calendarId: string | undefined,
): Promise<string> {
  const calendars = await deps.calendarService.listCalendars(userId);
  if (calendarId) {
    const owned = calendars.find((c) => c.id === calendarId);
    if (!owned) throw new Error(`Calendar not found or not yours: ${calendarId}`);
    return owned.id;
  }
  const primary = calendars.find((c) => c.isPrimary) ?? calendars[0];
  if (primary) return primary.id;
  const created = await deps.calendarService.createCalendar(userId, { name: 'Primary' });
  return created.id;
}

/**
 * Load an event row, userId-scoped. Throws 404 when missing and 403 on
 * cross-user rows — the row is never touched otherwise.
 */
async function loadOwnedEvent(
  deps: QuantyCalendarToolsDeps,
  eventId: string,
  userId: string,
): Promise<EventRowLike> {
  const row = (await deps.prisma.event.findUnique({ where: { id: eventId } })) as EventRowLike | null;
  if (!row) throw new Error(`Event not found: ${eventId}`);
  if (row.userId !== userId) throw new Error(`Not authorized to access event: ${eventId}`);
  return row;
}

type ToolHandler = (
  args: Record<string, unknown>,
  context: AssistantContext,
) => Promise<AIToolResult>;

/**
 * Wrap a handler with audit logging + uniform error mapping.
 * userId is taken from context ONLY — never from args.
 */
function wrapTool(
  deps: QuantyCalendarToolsDeps,
  toolName: string,
  handler: (args: Record<string, unknown>, userId: string) => Promise<AIToolResult>,
): ToolHandler {
  const audit = deps.audit ?? defaultAudit;
  return async (args, context) => {
    const userId = context.userId;
    const at = new Date().toISOString();
    if (!userId) {
      const entry: CalendarAuditEntry = {
        tool: toolName,
        userId: '',
        args: sanitizeArgs(args),
        success: false,
        at,
        error: 'Missing userId in agent context',
      };
      await audit(entry);
      return { success: false, error: entry.error, displayMessage: 'Not authenticated.' };
    }
    try {
      const result = await handler(args, userId);
      await audit({ tool: toolName, userId, args: sanitizeArgs(args), success: true, at });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await audit({ tool: toolName, userId, args: sanitizeArgs(args), success: false, at, error: message });
      return { success: false, error: message, displayMessage: `Couldn't complete ${toolName}: ${message}` };
    }
  };
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export function buildQuantyCalendarTools(deps: QuantyCalendarToolsDeps): QuantyCalendarTool[] {
  const { prisma } = deps;

  const listEvents: QuantyCalendarTool = {
    name: 'list_events',
    description: 'List the user\'s calendar events in a time range (ISO 8601 start/end). Recurring series are reported as series — occurrences are not expanded.',
    parameters: {
      start: { type: 'string', description: 'Range start, ISO 8601 (e.g. 2026-10-10T00:00:00Z)', required: true },
      end: { type: 'string', description: 'Range end, ISO 8601 (e.g. 2026-10-10T23:59:59Z)', required: true },
      calendarId: { type: 'string', description: 'Only events from this calendar', required: false },
      q: { type: 'string', description: 'Filter by title/description/location (case-insensitive)', required: false },
      limit: { type: 'number', description: 'Max events to return (default 50, max 200)', required: false },
    },
    destructive: false,
    reversible: true,
    requiresConfirmation: false,
    handler: wrapTool(deps, 'list_events', async (args, userId) => {
      const start = dateArg(args, 'start')!;
      const end = dateArg(args, 'end')!;
      checkWindow(start, end);
      const calendarId = optStr(args, 'calendarId');
      const limit = Math.min(Math.max(numArg(args, 'limit', 50), 1), 200);
      const q = optStr(args, 'q')?.trim();
      const textMatch = q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
              { location: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {};

      const rows = (await prisma.event.findMany({
        where: {
          userId,
          recurrenceRule: null,
          startTime: { gte: start, lte: end },
          ...(calendarId ? { calendarId } : {}),
          ...textMatch,
        },
        orderBy: { startTime: 'asc' },
        take: limit,
      })) as EventRowLike[];

      // Recurring series intersecting the window — reported as series.
      // Their individual occurrences are not expanded (no fabrication).
      const recurringRows = (await prisma.event.findMany({
        where: {
          userId,
          recurrenceRule: { not: null },
          startTime: { lte: end },
          ...(calendarId ? { calendarId } : {}),
          ...textMatch,
        },
        orderBy: { startTime: 'asc' },
        take: Math.min(limit, 50),
      })) as EventRowLike[];

      const merged = [...rows, ...recurringRows]
        .filter((r, i, all) => all.findIndex((o) => o.id === r.id) === i)
        .map(toEventSummary)
        .sort((a, b) => String(a.startTime ?? '').localeCompare(String(b.startTime ?? '')))
        .slice(0, limit);

      return {
        success: true,
        data: { events: merged, total: merged.length, range: { start: start.toISOString(), end: end.toISOString() } },
        displayMessage:
          merged.length === 0
            ? 'No events in that range.'
            : `${merged.length} event${merged.length === 1 ? '' : 's'} in that range.`,
      };
    }),
  };

  const createEvent: QuantyCalendarTool = {
    name: 'create_event',
    description: 'Create a calendar event. Requires user confirmation before invoking.',
    parameters: {
      title: { type: 'string', description: 'Event title', required: true },
      start: { type: 'string', description: 'Start time, ISO 8601 (e.g. 2026-10-11T15:00:00Z)', required: true },
      end: { type: 'string', description: 'End time, ISO 8601 (defaults to start + 1 hour)', required: false },
      description: { type: 'string', description: 'Event description', required: false },
      location: { type: 'string', description: 'Event location', required: false },
      attendees: { type: 'array', description: 'Attendee email addresses', required: false },
      calendarId: { type: 'string', description: 'Calendar to create in (defaults to primary)', required: false },
      allDay: { type: 'boolean', description: 'All-day event (default false)', required: false },
    },
    destructive: true,
    reversible: true,
    requiresConfirmation: true,
    handler: wrapTool(deps, 'create_event', async (args, userId) => {
      const title = strArg(args, 'title').trim();
      if (!title) throw new Error('Title cannot be empty.');
      if (title.length > 300) throw new Error('Title is too long (max 300 characters).');
      const start = dateArg(args, 'start')!;
      const endRaw = dateArg(args, 'end', false);
      const end = endRaw ?? new Date(start.getTime() + 3_600_000);
      if (end < start) throw new Error('`end` cannot be before `start`.');
      const calendarId = await resolveCalendarId(deps, userId, optStr(args, 'calendarId'));
      const attendees = parseAttendees(args.attendees);
      if (attendees.length > 200) throw new Error('Too many attendees (max 200).');

      const now = new Date();
      const created = (await prisma.event.create({
        data: {
          title,
          description: optStr(args, 'description') ?? '',
          startTime: start,
          endTime: end,
          allDay: boolArg(args, 'allDay', false),
          location: optStr(args, 'location') ?? '',
          userId,
          calendarId,
          status: 'confirmed',
          attendees: JSON.stringify(toStoredAttendees(attendees)),
          reminders: '[]',
          recurrenceRule: null,
          createdAt: now,
          updatedAt: now,
        },
      })) as EventRowLike;

      return {
        success: true,
        data: { event: toEventSummary(created) },
        displayMessage: `Created "${title}" on ${start.toLocaleString()}.`,
      };
    }),
  };

  const updateEvent: QuantyCalendarTool = {
    name: 'update_event',
    description: 'Update a calendar event (title, times, location, description, status, attendees). Requires user confirmation before invoking.',
    parameters: {
      eventId: { type: 'string', description: 'Event ID to update', required: true },
      title: { type: 'string', description: 'New title', required: false },
      start: { type: 'string', description: 'New start time, ISO 8601', required: false },
      end: { type: 'string', description: 'New end time, ISO 8601', required: false },
      description: { type: 'string', description: 'New description', required: false },
      location: { type: 'string', description: 'New location', required: false },
      status: { type: 'string', description: 'New status', required: false, enum: ['confirmed', 'tentative', 'cancelled'] },
      attendees: { type: 'array', description: 'Replace attendee email addresses', required: false },
      calendarId: { type: 'string', description: 'Move to this calendar', required: false },
    },
    destructive: true,
    reversible: true,
    requiresConfirmation: true,
    handler: wrapTool(deps, 'update_event', async (args, userId) => {
      const eventId = strArg(args, 'eventId');
      if (eventId.includes('_')) {
        throw new Error(
          'That id is a single occurrence of a recurring series. Quanty updates whole series only — pass the series id (before the "_") or edit the occurrence in the calendar app.',
        );
      }
      const existing = await loadOwnedEvent(deps, eventId, userId);

      const data: Record<string, unknown> = { updatedAt: new Date() };
      const title = optStr(args, 'title');
      if (title !== undefined) {
        if (!title.trim()) throw new Error('Title cannot be empty.');
        if (title.length > 300) throw new Error('Title is too long (max 300 characters).');
        data.title = title.trim();
      }
      const description = optStr(args, 'description');
      if (description !== undefined) data.description = description;
      const location = optStr(args, 'location');
      if (location !== undefined) data.location = location;
      const status = optStr(args, 'status');
      if (status !== undefined) {
        if (!['confirmed', 'tentative', 'cancelled'].includes(status)) {
          throw new Error('status must be one of: confirmed, tentative, cancelled.');
        }
        data.status = status;
      }
      const start = dateArg(args, 'start', false);
      const end = dateArg(args, 'end', false);
      const resolvedStart = start ?? new Date(existing.startTime as Date);
      const resolvedEnd = end ?? new Date(existing.endTime as Date);
      if (resolvedEnd < resolvedStart) throw new Error('`end` cannot be before `start`.');
      if (start) data.startTime = start;
      if (end) data.endTime = end;
      if (args.attendees !== undefined) {
        const attendees = parseAttendees(args.attendees);
        if (attendees.length > 200) throw new Error('Too many attendees (max 200).');
        data.attendees = JSON.stringify(toStoredAttendees(attendees));
      }
      const calendarId = optStr(args, 'calendarId');
      if (calendarId !== undefined) data.calendarId = await resolveCalendarId(deps, userId, calendarId);
      if (Object.keys(data).length === 1) {
        throw new Error('Nothing to update — pass at least one field to change.');
      }

      const updated = (await prisma.event.update({ where: { id: eventId }, data })) as EventRowLike;
      return {
        success: true,
        data: { event: toEventSummary(updated) },
        displayMessage: `Updated "${updated.title}".`,
      };
    }),
  };

  const deleteEvent: QuantyCalendarTool = {
    name: 'delete_event',
    description: 'Delete a calendar event. For a recurring series pass scope "all" with the series id (the part before "_"). Requires user confirmation before invoking.',
    parameters: {
      eventId: { type: 'string', description: 'Event ID to delete', required: true },
      scope: { type: 'string', description: 'For recurring occurrences: "all" deletes the whole series', required: false },
    },
    destructive: true,
    reversible: false,
    requiresConfirmation: true,
    handler: wrapTool(deps, 'delete_event', async (args, userId) => {
      const rawId = strArg(args, 'eventId');
      let eventId = rawId;
      if (rawId.includes('_')) {
        if (optStr(args, 'scope') !== 'all') {
          throw new Error(
            'That id is a single occurrence of a recurring series. Pass scope "all" to delete the whole series, or delete the single occurrence in the calendar app.',
          );
        }
        eventId = rawId.split('_')[0]!;
      }
      const existing = await loadOwnedEvent(deps, eventId, userId);
      await prisma.event.delete({ where: { id: eventId } });
      return {
        success: true,
        data: { eventId, deletedTitle: existing.title },
        displayMessage: `Deleted "${existing.title}".`,
      };
    }),
  };

  const freeBusy: QuantyCalendarTool = {
    name: 'free_busy',
    description: 'Get merged busy blocks for a time range (ISO 8601 start/end). Recurring series are listed separately — their occurrences are not expanded.',
    parameters: {
      start: { type: 'string', description: 'Range start, ISO 8601', required: true },
      end: { type: 'string', description: 'Range end, ISO 8601', required: true },
      calendarId: { type: 'string', description: 'Only this calendar', required: false },
    },
    destructive: false,
    reversible: true,
    requiresConfirmation: false,
    handler: wrapTool(deps, 'free_busy', async (args, userId) => {
      const start = dateArg(args, 'start')!;
      const end = dateArg(args, 'end')!;
      checkWindow(start, end);
      const calendarId = optStr(args, 'calendarId');

      const rows = (await prisma.event.findMany({
        where: {
          userId,
          recurrenceRule: null,
          status: { not: 'cancelled' },
          startTime: { lt: end },
          endTime: { gt: start },
          ...(calendarId ? { calendarId } : {}),
        },
        select: { id: true, title: true, startTime: true, endTime: true },
      })) as Array<{ id: string; title: string; startTime: Date; endTime: Date }>;

      const recurringRows = (await prisma.event.findMany({
        where: {
          userId,
          recurrenceRule: { not: null },
          status: { not: 'cancelled' },
          startTime: { lte: end },
          ...(calendarId ? { calendarId } : {}),
        },
        select: { id: true, title: true, startTime: true, recurrenceRule: true },
      })) as EventRowLike[];

      // Merge overlapping intervals into busy blocks (same as /events/free-busy).
      const intervals = rows
        .map((e) => ({
          start: new Date(Math.max(new Date(e.startTime).getTime(), start.getTime())),
          end: new Date(Math.min(new Date(e.endTime).getTime(), end.getTime())),
        }))
        .sort((a, b) => a.start.getTime() - b.start.getTime());
      const busy: Array<{ start: string; end: string }> = [];
      for (const item of intervals) {
        const prev = busy[busy.length - 1];
        if (!prev) {
          busy.push({ start: item.start.toISOString(), end: item.end.toISOString() });
        } else {
          const prevEnd = new Date(prev.end).getTime();
          if (item.start.getTime() <= prevEnd) {
            if (item.end.getTime() > prevEnd) prev.end = item.end.toISOString();
          } else {
            busy.push({ start: item.start.toISOString(), end: item.end.toISOString() });
          }
        }
      }

      return {
        success: true,
        data: {
          timeRange: { start: start.toISOString(), end: end.toISOString() },
          busy,
          busyBlocksCount: busy.length,
          eventsCount: rows.length,
          recurringSeries: recurringRows.map((r) => ({
            id: r.id,
            title: r.title,
            recurrenceRule: r.recurrenceRule,
            note: 'Recurring series — occurrences not expanded; check individually.',
          })),
        },
        displayMessage:
          busy.length === 0
            ? 'Free — no busy blocks in that range.'
            : `${busy.length} busy block${busy.length === 1 ? '' : 's'} in that range.`,
      };
    }),
  };

  return [listEvents, createEvent, updateEvent, deleteEvent, freeBusy];
}
