// ============================================================================
// Quanty calendar tools — unit tests
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AssistantContext } from '@quant/ai';
import { CalendarService } from '../services/calendar.service';
import {
  buildQuantyCalendarTools,
  type QuantyCalendarTool,
  type QuantyCalendarToolsDeps,
  type CalendarAuditEntry,
} from '../services/quanty-agent/tools/calendar-tools';

const USER_ID = 'user-1';
const OTHER_USER = 'user-2';
const CALENDAR_ID = 'cal-1';

function makeContext(userId = USER_ID): AssistantContext {
  return {
    userId,
    currentApp: 'quantmail',
    conversationHistory: [],
    crossAppState: {},
  };
}

function makeDeps(overrides: Partial<QuantyCalendarToolsDeps> = {}): QuantyCalendarToolsDeps & {
  prisma: any;
  auditLog: CalendarAuditEntry[];
} {
  const auditLog: CalendarAuditEntry[] = [];
  const prisma = {
    calendar: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    event: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
  return {
    prisma,
    calendarService: new CalendarService(prisma as any),
    audit: (entry: CalendarAuditEntry) => {
      auditLog.push(entry);
    },
    auditLog,
    ...overrides,
  } as any;
}

function mockCalendars(deps: any, calendars: Array<{ id: string; userId: string; name: string; color: string | null; isPrimary: boolean }> = [{ id: CALENDAR_ID, userId: USER_ID, name: 'Primary', color: '#3B82F6', isPrimary: true }]) {
  deps.prisma.calendar.findMany.mockResolvedValue(calendars);
}

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt-1',
    calendarId: CALENDAR_ID,
    title: 'Team standup',
    description: 'Daily sync',
    startTime: new Date('2026-10-11T09:00:00Z'),
    endTime: new Date('2026-10-11T09:30:00Z'),
    allDay: false,
    location: 'Room A',
    userId: USER_ID,
    status: 'confirmed',
    attendees: '[]',
    recurrenceRule: null,
    timeZone: 'UTC',
    ...overrides,
  };
}

const RANGE = { start: '2026-10-11T00:00:00Z', end: '2026-10-11T23:59:59Z' };

describe('quanty calendar tools', () => {
  let deps: ReturnType<typeof makeDeps>;
  let tools: QuantyCalendarTool[];
  let byName: Map<string, QuantyCalendarTool>;

  beforeEach(() => {
    deps = makeDeps();
    tools = buildQuantyCalendarTools(deps);
    byName = new Map(tools.map((t) => [t.name, t]));
    mockCalendars(deps);
  });

  it('exposes exactly the 5 calendar tools', () => {
    expect(tools).toHaveLength(5);
    for (const name of ['list_events', 'create_event', 'update_event', 'delete_event', 'free_busy']) {
      expect(byName.has(name), `missing tool ${name}`).toBe(true);
    }
  });

  it('marks safety flags correctly', () => {
    expect(byName.get('list_events')).toMatchObject({ destructive: false, requiresConfirmation: false });
    expect(byName.get('free_busy')).toMatchObject({ destructive: false, requiresConfirmation: false });
    expect(byName.get('create_event')).toMatchObject({ destructive: true, requiresConfirmation: true });
    expect(byName.get('update_event')).toMatchObject({ destructive: true, requiresConfirmation: true });
    expect(byName.get('delete_event')).toMatchObject({ destructive: true, requiresConfirmation: true });
  });

  it('list_events returns events in the requested window', async () => {
    deps.prisma.event.findMany
      .mockResolvedValueOnce([eventRow()])
      .mockResolvedValueOnce([]);
    const res = await byName.get('list_events')!.handler(RANGE, makeContext());
    expect(res.success).toBe(true);
    expect((res.data as any).events).toHaveLength(1);
    expect((res.data as any).events[0]).toMatchObject({ id: 'evt-1', title: 'Team standup' });
    // userId-scoped query.
    expect(deps.prisma.event.findMany.mock.calls[0][0].where.userId).toBe(USER_ID);
  });

  it('list_events supports text filtering', async () => {
    deps.prisma.event.findMany
      .mockResolvedValueOnce([eventRow()])
      .mockResolvedValueOnce([]);
    const res = await byName.get('list_events')!.handler({ ...RANGE, q: 'standup' }, makeContext());
    expect(res.success).toBe(true);
    const where = deps.prisma.event.findMany.mock.calls[0][0].where;
    expect(where.OR).toHaveLength(3);
  });

  it('list_events rejects invalid dates and inverted ranges', async () => {
    const bad = await byName.get('list_events')!.handler({ start: 'nope', end: RANGE.end }, makeContext());
    expect(bad.success).toBe(false);
    expect(bad.error).toMatch(/ISO 8601/);
    const inverted = await byName.get('list_events')!.handler(
      { start: RANGE.end, end: RANGE.start },
      makeContext(),
    );
    expect(inverted.success).toBe(false);
    expect(inverted.error).toMatch(/before/);
  });

  it('list_events reports recurring series without fabricating occurrences', async () => {
    deps.prisma.event.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([eventRow({ id: 'evt-rec', title: 'Weekly 1:1', recurrenceRule: 'RRULE:FREQ=WEEKLY' })]);
    const res = await byName.get('list_events')!.handler(RANGE, makeContext());
    expect(res.success).toBe(true);
    expect((res.data as any).events[0]).toMatchObject({ recurring: true, recurrenceRule: 'RRULE:FREQ=WEEKLY' });
  });

  it('create_event creates on the primary calendar by default', async () => {
    deps.prisma.event.create.mockResolvedValue(eventRow());
    const res = await byName.get('create_event')!.handler(
      { title: 'Dentist', start: '2026-10-12T10:00:00Z', location: 'Clinic', attendees: ['doc@example.com'] },
      makeContext(),
    );
    expect(res.success).toBe(true);
    const data = deps.prisma.event.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ title: 'Dentist', userId: USER_ID, calendarId: CALENDAR_ID, status: 'confirmed' });
    expect(data.endTime).toEqual(new Date('2026-10-12T11:00:00Z')); // default +1h
    expect(JSON.parse(data.attendees)).toEqual([
      { userId: '', email: 'doc@example.com', name: '', status: 'pending' },
    ]);
  });

  it('create_event requires a title and valid times', async () => {
    const noTitle = await byName.get('create_event')!.handler({ start: '2026-10-12T10:00:00Z' }, makeContext());
    expect(noTitle.success).toBe(false);
    expect(noTitle.error).toMatch(/title/);
    const badRange = await byName.get('create_event')!.handler(
      { title: 'X', start: '2026-10-12T12:00:00Z', end: '2026-10-12T10:00:00Z' },
      makeContext(),
    );
    expect(badRange.success).toBe(false);
    expect(badRange.error).toMatch(/before/);
  });

  it('create_event rejects a calendar that is not yours', async () => {
    mockCalendars(deps, [{ id: 'other-cal', userId: OTHER_USER, name: 'Work', color: null, isPrimary: true }]);
    const res = await byName.get('create_event')!.handler(
      { title: 'X', start: '2026-10-12T10:00:00Z', calendarId: CALENDAR_ID },
      makeContext(),
    );
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not yours/);
    expect(deps.prisma.event.create).not.toHaveBeenCalled();
  });

  it('update_event applies the changed fields', async () => {
    deps.prisma.event.findUnique.mockResolvedValue(eventRow());
    deps.prisma.event.update.mockResolvedValue(eventRow({ title: 'Team standup (moved)' }));
    const res = await byName.get('update_event')!.handler(
      { eventId: 'evt-1', title: 'Team standup (moved)', start: '2026-10-11T10:00:00Z', end: '2026-10-11T10:30:00Z' },
      makeContext(),
    );
    expect(res.success).toBe(true);
    const data = deps.prisma.event.update.mock.calls[0][0].data;
    expect(data.title).toBe('Team standup (moved)');
    expect(data.startTime).toEqual(new Date('2026-10-11T10:00:00Z'));
  });

  it('update_event rejects unknown ids and cross-user rows', async () => {
    deps.prisma.event.findUnique.mockResolvedValue(null);
    const missing = await byName.get('update_event')!.handler({ eventId: 'nope', title: 'X' }, makeContext());
    expect(missing.success).toBe(false);
    expect(missing.error).toMatch(/not found/);

    deps.prisma.event.findUnique.mockResolvedValue(eventRow({ userId: OTHER_USER }));
    const cross = await byName.get('update_event')!.handler({ eventId: 'evt-1', title: 'X' }, makeContext());
    expect(cross.success).toBe(false);
    expect(cross.error).toMatch(/Not authorized/);
    expect(deps.prisma.event.update).not.toHaveBeenCalled();
  });

  it('update_event refuses to guess when nothing changes', async () => {
    deps.prisma.event.findUnique.mockResolvedValue(eventRow());
    const res = await byName.get('update_event')!.handler({ eventId: 'evt-1' }, makeContext());
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Nothing to update/);
  });

  it('delete_event deletes an owned event', async () => {
    deps.prisma.event.findUnique.mockResolvedValue(eventRow());
    deps.prisma.event.delete.mockResolvedValue(eventRow());
    const res = await byName.get('delete_event')!.handler({ eventId: 'evt-1' }, makeContext());
    expect(res.success).toBe(true);
    expect((res.data as any).eventId).toBe('evt-1');
    expect(deps.prisma.event.delete).toHaveBeenCalledWith({ where: { id: 'evt-1' } });
  });

  it('delete_event rejects cross-user deletes and single-occurrence ids', async () => {
    deps.prisma.event.findUnique.mockResolvedValue(eventRow({ userId: OTHER_USER }));
    const cross = await byName.get('delete_event')!.handler({ eventId: 'evt-1' }, makeContext());
    expect(cross.success).toBe(false);
    expect(cross.error).toMatch(/Not authorized/);
    expect(deps.prisma.event.delete).not.toHaveBeenCalled();

    const occ = await byName.get('delete_event')!.handler(
      { eventId: 'evt-rec_20261011T090000Z' },
      makeContext(),
    );
    expect(occ.success).toBe(false);
    expect(occ.error).toMatch(/scope "all"/);
  });

  it('delete_event deletes a whole recurring series with scope "all"', async () => {
    deps.prisma.event.findUnique.mockResolvedValue(eventRow({ id: 'evt-rec' }));
    deps.prisma.event.delete.mockResolvedValue(eventRow({ id: 'evt-rec' }));
    const res = await byName.get('delete_event')!.handler(
      { eventId: 'evt-rec_20261011T090000Z', scope: 'all' },
      makeContext(),
    );
    expect(res.success).toBe(true);
    expect(deps.prisma.event.delete).toHaveBeenCalledWith({ where: { id: 'evt-rec' } });
  });

  it('free_busy merges overlapping intervals into busy blocks', async () => {
    deps.prisma.event.findMany
      .mockResolvedValueOnce([
        { id: 'a', title: 'A', startTime: new Date('2026-10-11T09:00:00Z'), endTime: new Date('2026-10-11T10:00:00Z') },
        { id: 'b', title: 'B', startTime: new Date('2026-10-11T09:30:00Z'), endTime: new Date('2026-10-11T11:00:00Z') },
        { id: 'c', title: 'C', startTime: new Date('2026-10-11T14:00:00Z'), endTime: new Date('2026-10-11T15:00:00Z') },
      ])
      .mockResolvedValueOnce([]);
    const res = await byName.get('free_busy')!.handler(RANGE, makeContext());
    expect(res.success).toBe(true);
    expect((res.data as any).busyBlocksCount).toBe(2);
    expect((res.data as any).busy[0]).toEqual({
      start: '2026-10-11T09:00:00.000Z',
      end: '2026-10-11T11:00:00.000Z',
    });
  });

  it('free_busy reports free ranges honestly', async () => {
    deps.prisma.event.findMany.mockResolvedValue([]).mockResolvedValue([]);
    const res = await byName.get('free_busy')!.handler(RANGE, makeContext());
    expect(res.success).toBe(true);
    expect((res.data as any).busy).toEqual([]);
    expect(res.displayMessage).toMatch(/Free/);
  });

  it('derives userId from context only — never from args', async () => {
    deps.prisma.event.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await byName.get('list_events')!.handler(
      { ...RANGE, userId: OTHER_USER },
      makeContext(USER_ID),
    );
    expect(deps.prisma.event.findMany.mock.calls[0][0].where.userId).toBe(USER_ID);
  });

  it('fails honestly without a userId in context', async () => {
    const res = await byName.get('list_events')!.handler(RANGE, makeContext('' as any));
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/userId/);
    expect(deps.prisma.event.findMany).not.toHaveBeenCalled();
  });

  it('audits every invocation (success and failure)', async () => {
    deps.prisma.event.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await byName.get('list_events')!.handler(RANGE, makeContext());
    await byName.get('list_events')!.handler({ start: 'bad', end: RANGE.end }, makeContext());
    expect(deps.auditLog).toHaveLength(2);
    expect(deps.auditLog[0]).toMatchObject({ tool: 'list_events', userId: USER_ID, success: true });
    expect(deps.auditLog[1]).toMatchObject({ tool: 'list_events', userId: USER_ID, success: false });
    expect(deps.auditLog[1].error).toBeTruthy();
  });

  it('truncates long descriptions in the audit log', async () => {
    deps.prisma.event.create.mockResolvedValue(eventRow());
    const long = 'x'.repeat(500);
    await byName.get('create_event')!.handler(
      { title: 'X', start: '2026-10-12T10:00:00Z', description: long },
      makeContext(),
    );
    expect(deps.auditLog[0].args.description).toMatch(/\[truncated\]$/);
  });
});
