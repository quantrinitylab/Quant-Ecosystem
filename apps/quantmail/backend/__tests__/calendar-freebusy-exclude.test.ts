// @vitest-environment node
// ============================================================================
// /events/free-busy — excludeEventId (fix/qm-freebusy-exclude-event).
// ============================================================================
//
// The defect: Find-a-time while EDITING an event treated the event's own
// occurrence as a conflict, steering the organizer away from their current
// time. Google Calendar excludes the event being edited from its own
// free-busy scan; this endpoint had no such parameter and the form passed
// none.
//
// Pinned here, against the REAL calendarRoutes on a bare Fastify app with a
// spy Prisma (same harness shape as calendar.routes.test.ts):
//
//   1. A non-recurring event is dropped from busy/conflicts when its id is
//      passed as excludeEventId, and the Prisma `where` carries
//      `id: { not: <id> }`.
//   2. A recurring SERIES is dropped wholesale when its series id is passed
//      (the row is skipped before expansion).
//   3. A single OCCURRENCE is dropped when its occurrence id
//      (`<seriesId>_<occurrenceISO>`) is passed — and sibling occurrences in
//      the same window survive, proving the exclusion is occurrence-precise
//      rather than series-wide.
//   4. A blank excludeEventId is a no-op, not a filter that drops everything.
//
// The frontend half (CalendarEventForm passes editingEventId as
// excludeEventId) is a param pass-through over apiFetchRaw's `params`, which
// URL-encodes it into the query string; there is no transform to unit-test.

import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import calendarRoutes from '../routes/calendar';

const DAY = '2026-09-10';

function row(over: Record<string, unknown>) {
  return {
    id: 'evt-1',
    userId: 'user-1',
    title: 'Event',
    description: '',
    startTime: new Date(`${DAY}T09:00:00.000Z`),
    endTime: new Date(`${DAY}T10:00:00.000Z`),
    allDay: false,
    location: '',
    status: 'confirmed',
    attendees: '[]',
    reminders: '[]',
    recurrenceRule: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    ...over,
  };
}

interface Harness {
  app: ReturnType<typeof Fastify>;
  findMany: ReturnType<typeof vi.fn>;
}

async function buildApp(nonRecurring: unknown[], recurring: unknown[]): Promise<Harness> {
  // The fake models the one Prisma semantic under test: `where.id: { not }`
  // filters rows out, exactly as Prisma would for a real query. (A fake that
  // ignored the where clause would make the excluded-call response
  // assertions vacuous — the where-clause assertion below pins the clause,
  // and this filter lets the response assertions check its effect.)
  const findMany = vi.fn(
    async (args: { where?: { recurrenceRule?: unknown; id?: { not?: string } } }) => {
      const rows = args?.where?.recurrenceRule === null ? nonRecurring : recurring;
      const notId = args?.where?.id?.not;
      return notId
        ? (rows as Array<{ id: string }>).filter((r) => r.id !== notId)
        : rows;
    },
  );
  const prisma = {
    event: { findMany },
    calendar: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})),
  };
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  app.decorate('prisma', prisma as never);
  app.addHook('onRequest', async (request) => {
    (request as unknown as { auth: { userId: string } }).auth = { userId: 'user-1' };
  });
  await app.register(calendarRoutes);
  await app.ready();
  return { app, findMany };
}

async function freeBusy(
  app: ReturnType<typeof Fastify>,
  query: string,
): Promise<{ busy: Array<{ start: string; end: string }>; conflictsCount: number }> {
  const res = await app.inject({ method: 'GET', url: `/events/free-busy?${query}` });
  expect(res.statusCode).toBe(200);
  const json = res.json() as {
    success: boolean;
    data: { busy: Array<{ start: string; end: string }>; conflictsCount: number };
  };
  expect(json.success).toBe(true);
  return json.data;
}

const WINDOW = `start=${DAY}T00:00:00.000Z&end=${DAY}T23:59:59.000Z`;

describe('free-busy excludeEventId', () => {
  it('drops a non-recurring event by id and passes id:{not} to Prisma', async () => {
    const editing = row({ id: 'evt-editing' });
    const other = row({
      id: 'evt-other',
      startTime: new Date(`${DAY}T11:00:00.000Z`),
      endTime: new Date(`${DAY}T12:00:00.000Z`),
    });
    const { app, findMany } = await buildApp([editing, other], []);

    const without = await freeBusy(app, WINDOW);
    expect(without.conflictsCount).toBe(2);
    expect(without.busy).toHaveLength(2);

    const excluded = await freeBusy(app, `${WINDOW}&excludeEventId=evt-editing`);
    expect(excluded.conflictsCount).toBe(1);
    expect(excluded.busy).toEqual([
      { start: `${DAY}T11:00:00.000Z`, end: `${DAY}T12:00:00.000Z` },
    ]);

    // The exclusion must reach Prisma as a where-clause filter, not just a
    // post-filter on the response: the second call's non-recurring query
    // carries id: { not: 'evt-editing' }.
    const nonRecurringCalls = findMany.mock.calls.filter(
      (call) => (call[0] as { where: { recurrenceRule: unknown } }).where.recurrenceRule === null,
    );
    expect(nonRecurringCalls).toHaveLength(2);
    const where = (
      nonRecurringCalls[1]![0] as { where: Record<string, unknown> }
    ).where;
    expect(where.id).toEqual({ not: 'evt-editing' });
  });

  it('drops a whole recurring series when the series id is excluded', async () => {
    const series = row({
      id: 'rec-1',
      startTime: new Date('2026-09-09T09:00:00.000Z'),
      endTime: new Date('2026-09-09T10:00:00.000Z'),
      recurrenceRule: 'FREQ=DAILY',
    });
    const { app } = await buildApp([], [series]);

    const without = await freeBusy(app, WINDOW);
    expect(without.conflictsCount).toBe(1);
    expect(without.busy).toEqual([
      { start: `${DAY}T09:00:00.000Z`, end: `${DAY}T10:00:00.000Z` },
    ]);

    const excluded = await freeBusy(app, `${WINDOW}&excludeEventId=rec-1`);
    expect(excluded.conflictsCount).toBe(0);
    expect(excluded.busy).toEqual([]);
  });

  it('drops exactly one occurrence when its occurrence id is excluded', async () => {
    const series = row({
      id: 'rec-1',
      startTime: new Date('2026-09-09T09:00:00.000Z'),
      endTime: new Date('2026-09-09T10:00:00.000Z'),
      recurrenceRule: 'FREQ=DAILY',
    });
    const { app } = await buildApp([], [series]);
    const twoDay = `start=${DAY}T00:00:00.000Z&end=2026-09-11T23:59:59.000Z`;

    const without = await freeBusy(app, twoDay);
    expect(without.conflictsCount).toBe(2);

    // Expanded occurrences carry `<seriesId>_<occurrenceISO>` ids.
    const occurrenceId = encodeURIComponent('rec-1_2026-09-10T09:00:00.000Z');
    const excluded = await freeBusy(app, `${twoDay}&excludeEventId=${occurrenceId}`);
    expect(excluded.conflictsCount).toBe(1);
    expect(excluded.busy).toEqual([
      { start: '2026-09-11T09:00:00.000Z', end: '2026-09-11T10:00:00.000Z' },
    ]);
  });

  it('treats a blank excludeEventId as no exclusion', async () => {
    const editing = row({ id: 'evt-editing' });
    const { app } = await buildApp([editing], []);
    const data = await freeBusy(app, `${WINDOW}&excludeEventId=`);
    expect(data.conflictsCount).toBe(1);
    expect(data.busy).toHaveLength(1);
  });
});
