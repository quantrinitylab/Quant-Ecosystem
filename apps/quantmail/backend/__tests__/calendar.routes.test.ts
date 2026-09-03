// @vitest-environment node
// ============================================================================
// /events, /calendars — the routes, not a service.
// ============================================================================
//
// Two defects are pinned here.
//
//   1. The calendar page's edit sheet has always saved through api-client's
//      `updateEvent` → `PUT /events/:id`. The Next allow-list permits PUT on
//      that pattern, so the request reached this router and 404'd: there was no
//      PUT handler. Creating an entry worked and editing the same entry failed
//      with "Failed to update entry", from a route that was never written.
//   2. An unparseable date reached Prisma as `Invalid Date` and came back to the
//      client as a 500, which says "we broke" for what is a bad request.
//
// Also asserted: `/events/today` and `/events/upcoming` still reach their own
// handlers now that a parametric `/events/:id` is registered alongside them.
//
// HARNESS: the REAL calendarRoutes on a bare Fastify app with NO prefix, which
// is how `backend/app.ts` registers them, plus the REAL error handler so a
// rejected body is asserted as the 400 a client actually receives. Prisma is a
// spy object — what the handler passes down is the thing under test.

import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin } from '@quant/server-core';
import calendarRoutes from '../routes/calendar';

const ROW = {
  id: 'e1',
  userId: 'user-1',
  title: 'Design review',
  description: 'agenda lives in the doc',
  startTime: new Date('2026-09-10T09:00:00.000Z'),
  endTime: new Date('2026-09-10T10:00:00.000Z'),
  allDay: false,
  location: 'Meet',
  status: 'confirmed',
  attendees: '[]',
  reminders: '[]',
  recurrenceRule: null,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
};

function fakePrisma() {
  return {
    event: {
      findUnique: vi.fn().mockResolvedValue(ROW),
      findMany: vi.fn().mockResolvedValue([ROW]),
      create: vi.fn().mockResolvedValue(ROW),
      update: vi.fn().mockResolvedValue(ROW),
      delete: vi.fn().mockResolvedValue(ROW),
    },
    calendar: {
      findMany: vi.fn().mockResolvedValue([{ id: 'cal-1', name: 'My Calendar' }]),
      create: vi.fn(),
    },
  };
}

let prisma: ReturnType<typeof fakePrisma>;

async function buildApp(userId: string | null = 'user-1') {
  prisma = fakePrisma();
  const app = Fastify();
  await app.register(errorHandlerPlugin);
  // Only the `event` and `calendar` delegates are faked; `fastify.prisma` is
  // typed as the whole client, hence the cast.
  app.decorate('prisma', prisma as never);
  app.addHook('onRequest', async (request) => {
    if (userId) (request as unknown as { auth: { userId: string } }).auth = { userId };
  });
  // No prefix: `backend/app.ts` does `app.register(calendarRoutes)` at the root,
  // so the reachable paths really are /events and /calendars.
  await app.register(calendarRoutes);
  await app.ready();
  return app;
}

/** The `data` the update handler passed down to `prisma.event.update`. */
function updateData(): Record<string, unknown> {
  const arg = prisma.event.update.mock.calls[0]![0] as { data: Record<string, unknown> };
  return arg.data;
}

// The edit sheet sends every field it collects, and the Event model has columns
// for six of them. The rest ride inside `description` as a __QUANT_META__ header
// or are dropped — either way the route must not reject the body over them.
const PAGE_PAYLOAD = {
  title: 'Design review',
  startTime: '2026-09-11T09:00:00.000Z',
  endTime: '2026-09-11T10:30:00.000Z',
  start: '2026-09-11T09:00:00.000Z',
  end: '2026-09-11T10:30:00.000Z',
  description: '__QUANT_META__:{"type":"event"}:__END_QUANT_META__\nagenda',
  location: 'Meet',
  allDay: false,
  type: 'event',
  color: '#FF8C42',
  recurrence: 'none',
  reminders: [10],
  attendees: ['ada@example.com'],
  accountEmail: 'kundan@quantmail.in',
  timezone: 'Asia/Kolkata',
  driveLink: '',
};

describe('PUT /events/:id — the route the edit sheet has always called', () => {
  it('exists, and answers the enveloped shape the api-client expects', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'PUT', url: '/events/e1', payload: PAGE_PAYLOAD });

    // A 404 here is the shipped bug: allow-list passed, router had no handler.
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    expect(res.json().data).toMatchObject({ id: 'e1', title: 'Design review' });
  });

  it('accepts the whole payload the edit sheet sends and writes only real columns', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'PUT', url: '/events/e1', payload: PAGE_PAYLOAD });

    expect(res.statusCode).toBe(200);
    const data = updateData();
    expect(data).toMatchObject({
      title: 'Design review',
      location: 'Meet',
      allDay: false,
      startTime: new Date('2026-09-11T09:00:00.000Z'),
      endTime: new Date('2026-09-11T10:30:00.000Z'),
    });
    // `color`, `attendees`, `timezone` and friends have no column on Event. A
    // strict schema would 400 the page's own payload; a passthrough one would
    // hand Prisma unknown keys and throw. Stripped is the only correct answer.
    for (const key of ['type', 'color', 'recurrence', 'attendees', 'timezone', 'driveLink'])
      expect(data).not.toHaveProperty(key);
  });

  it('reads the start/end spelling as well as startTime/endTime', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/events/e1',
      payload: { start: '2026-12-01T05:00:00.000Z', end: '2026-12-01T06:00:00.000Z' },
    });

    expect(res.statusCode).toBe(200);
    expect(updateData()).toMatchObject({
      startTime: new Date('2026-12-01T05:00:00.000Z'),
      endTime: new Date('2026-12-01T06:00:00.000Z'),
    });
  });

  it('stamps updatedAt by hand, because the model has no @updatedAt', async () => {
    const app = await buildApp();
    await app.inject({ method: 'PUT', url: '/events/e1', payload: { title: 'Renamed' } });

    // Without this the row keeps its create-time value forever and every
    // "sort by recently changed" reads a lie.
    expect(updateData().updatedAt).toBeInstanceOf(Date);
  });
});

describe('PUT /events/:id — what it refuses', () => {
  it("404s an event owned by somebody else, and doesn't write", async () => {
    const app = await buildApp();
    prisma.event.findUnique.mockResolvedValue({ ...ROW, userId: 'user-2' });
    const res = await app.inject({ method: 'PUT', url: '/events/e1', payload: { title: 'Mine' } });

    // 404 rather than 403: a stranger's event id should not be confirmable.
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('EVENT_NOT_FOUND');
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it('404s an id that does not exist', async () => {
    const app = await buildApp();
    prisma.event.findUnique.mockResolvedValue(null);
    const res = await app.inject({ method: 'PUT', url: '/events/nope', payload: { title: 'x' } });
    expect(res.statusCode).toBe(404);
  });

  it('400s an unparseable date instead of 500ing out of Prisma', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/events/e1',
      payload: { start: 'next tuesday-ish' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_DATE');
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it('400s an end before its start', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/events/e1',
      payload: { start: '2026-09-11T10:00:00.000Z', end: '2026-09-11T09:00:00.000Z' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_RANGE');
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it('400s a title of the wrong type rather than storing it', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'PUT', url: '/events/e1', payload: { title: 42 } });
    expect(res.statusCode).toBe(400);
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it('401s an unauthenticated request', async () => {
    const app = await buildApp(null);
    const res = await app.inject({ method: 'PUT', url: '/events/e1', payload: { title: 'x' } });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });
});

describe('the static /events routes a parametric :id could have shadowed', () => {
  it('routes /events/today to today, not to :id', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/events/today' });

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().data)).toBe(true);
    // Fastify's radix router prefers a static segment over `:id`. If that ever
    // stopped, this would arrive at the single-event handler instead.
    expect(prisma.event.findMany).toHaveBeenCalled();
    expect(prisma.event.findUnique).not.toHaveBeenCalled();
  });

  it('routes /events/upcoming to upcoming, not to :id, and honours ?limit', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/events/upcoming?limit=5' });

    expect(res.statusCode).toBe(200);
    const arg = prisma.event.findMany.mock.calls[0]![0] as { take: number };
    expect(arg.take).toBe(5);
    expect(prisma.event.findUnique).not.toHaveBeenCalled();
  });

  it('clamps a ?limit of 200 to 100 rather than reading it literally', async () => {
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/events/upcoming?limit=200' });
    const arg = prisma.event.findMany.mock.calls[0]![0] as { take: number };
    expect(arg.take).toBe(100);
  });
});

describe('GET /events/:id', () => {
  it('returns one event, enveloped, with both date spellings in the DTO', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/events/e1' });

    expect(res.statusCode).toBe(200);
    expect(prisma.event.findUnique).toHaveBeenCalledWith({ where: { id: 'e1' } });
    // `start`/`end` for the calendar page, `startTime`/`endTime` for api-client's
    // CalendarEvent type. Dropping either breaks one of the two.
    const body = res.json().data;
    expect(body.start).toBe(ROW.startTime.toISOString());
    expect(body.startTime).toBe(ROW.startTime.toISOString());
  });

  it('404s an event owned by somebody else', async () => {
    const app = await buildApp();
    prisma.event.findUnique.mockResolvedValue({ ...ROW, userId: 'user-2' });
    const res = await app.inject({ method: 'GET', url: '/events/e1' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('EVENT_NOT_FOUND');
  });
});

describe('POST /events', () => {
  it('creates from the payload the sheet sends', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/events', payload: PAGE_PAYLOAD });

    expect(res.statusCode).toBe(201);
    const arg = prisma.event.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data).toMatchObject({ userId: 'user-1', status: 'confirmed', location: 'Meet' });
  });

  it('400s an unparseable start instead of handing Prisma an Invalid Date', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/events',
      payload: { title: 'Coffee', start: 'whenever' },
    });

    // This used to be a 500 from deep inside the query engine.
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_DATE');
    expect(prisma.event.create).not.toHaveBeenCalled();
  });

  it('defaults a missing end to one hour after start', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/events',
      payload: { title: 'Coffee', start: '2026-09-11T09:00:00.000Z' },
    });

    const arg = prisma.event.create.mock.calls[0]![0] as { data: { endTime: Date } };
    expect(arg.data.endTime.toISOString()).toBe('2026-09-11T10:00:00.000Z');
  });
});

describe('DELETE /events/:id', () => {
  it('deletes an event the caller owns', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/events/e1' });
    expect(res.statusCode).toBe(200);
    expect(prisma.event.delete).toHaveBeenCalledWith({ where: { id: 'e1' } });
  });

  it("404s somebody else's event", async () => {
    const app = await buildApp();
    prisma.event.findUnique.mockResolvedValue({ ...ROW, userId: 'user-2' });
    const res = await app.inject({ method: 'DELETE', url: '/events/e1' });
    expect(res.statusCode).toBe(404);
    expect(prisma.event.delete).not.toHaveBeenCalled();
  });
});

describe('GET /calendars', () => {
  it('auto-provisions a primary calendar when the user has none', async () => {
    const app = await buildApp();
    prisma.calendar.findMany.mockResolvedValue([]);
    prisma.calendar.create.mockResolvedValue({ id: 'cal-new', name: 'My Calendar' });
    const res = await app.inject({ method: 'GET', url: '/calendars' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(1);
    const arg = prisma.calendar.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(arg.data).toMatchObject({ userId: 'user-1', isPrimary: true });
  });
});
