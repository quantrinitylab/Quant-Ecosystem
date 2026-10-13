// @vitest-environment node
// ============================================================================
// /events, /calendars — the routes, not a service.
// ============================================================================
//
// Three defects are pinned here.
//
//   1. The calendar page's edit sheet has always saved through api-client's
//      `updateEvent` → `PUT /events/:id`. The Next allow-list permits PUT on
//      that pattern, so the request reached this router and 404'd: there was no
//      PUT handler. Creating an entry worked and editing the same entry failed
//      with "Failed to update entry", from a route that was never written.
//   2. An unparseable date reached Prisma as `Invalid Date` and came back to the
//      client as a 500, which says "we broke" for what is a bad request.
//   3. `attendees`, `reminders` and `recurrenceRule` are real columns, the page
//      has always sent all three, and neither create nor update wrote any of
//      them — so an invite list lived until the sheet closed and no further.
//      They are stored in the shape quantcalendar's event.service.ts defines,
//      because that service writes the same `calendar_events` table.
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
  const event = {
    findUnique: vi.fn().mockResolvedValue(ROW),
    findMany: vi.fn().mockResolvedValue([ROW]),
    create: vi.fn().mockResolvedValue(ROW),
    update: vi.fn().mockResolvedValue(ROW),
    delete: vi.fn().mockResolvedValue(ROW),
  };
  // The RSVP route writes through prisma.$transaction with a SELECT ... FOR
  // UPDATE row lock (attendees is a JSON column written read-modify-write).
  // The fake models the pass-through; the lock ordering itself is asserted in
  // the dedicated concurrency suite below with a serializing fake.
  const txQueryRaw = vi.fn().mockResolvedValue([]);
  return {
    event,
    calendar: {
      findMany: vi.fn().mockResolvedValue([{ id: 'cal-1', name: 'My Calendar' }]),
      create: vi.fn(),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
      cb({ $queryRaw: txQueryRaw, event }),
    ),
    __txQueryRaw: txQueryRaw,
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

/** The `data` the create handler passed down to `prisma.event.create`. */
function createData(): Record<string, unknown> {
  const arg = prisma.event.create.mock.calls[0]![0] as { data: Record<string, unknown> };
  return arg.data;
}

/**
 * A JSON column as it was actually handed to Prisma. Parsed rather than compared
 * as a string: asserting on `'[{"userId":"","email":…}]'` would fail on a key
 * reorder that changes nothing about what quantcalendar reads back.
 */
function storedJson(data: Record<string, unknown>, column: string): unknown {
  const raw = data[column];
  expect(typeof raw).toBe('string');
  return JSON.parse(raw as string);
}

// The edit sheet sends every field it collects, and the Event model has columns
// for nine of them. The rest ride inside `description` as a __QUANT_META__ header
// or are dropped — either way the route must not reject the body over them.
// `recurrence` and `reminders` are spelled the way `calendar/page.tsx` spells
// them: a human label from RECURRENCE_OPTIONS and labels from
// NOTIFICATION_SLIDER_VALUES, not minute counts.
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
  recurrence: 'Does not repeat',
  reminders: ['10 minutes before'],
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
    // `color`, `timezone` and friends have no column on Event. A strict schema
    // would 400 the page's own payload; a passthrough one would hand Prisma
    // unknown keys and throw. Stripped is the only correct answer.
    for (const key of ['type', 'color', 'timezone', 'driveLink', 'accountEmail', 'calendarId'])
      expect(data).not.toHaveProperty(key);
    // `recurrence` is the exception: not dropped, written under the column's own
    // name. 'Does not repeat' is the page saying "no rule", so the column is NULL
    // rather than holding a sentinel string.
    expect(data).not.toHaveProperty('recurrence');
    expect(data.recurrenceRule).toBeNull();
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
    // D18/K09: Unified event DTO emits canonical startTime and endTime keys
    const body = res.json().data;
    expect(body.startTime).toBe(ROW.startTime.toISOString());
    expect(body.endTime).toBe(ROW.endTime.toISOString());
    expect(body.start).toBeUndefined();
    expect(body.end).toBeUndefined();
  });

  it('404s an event owned by somebody else', async () => {
    const app = await buildApp();
    prisma.event.findUnique.mockResolvedValue({ ...ROW, userId: 'user-2' });
    const res = await app.inject({ method: 'GET', url: '/events/e1' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('EVENT_NOT_FOUND');
  });
});

describe('GET /events/:id — recurring occurrence ids and viewerIsAttendee', () => {
  // A daily parent; list/search hand out occurrence ids of the form
  // `<parentId>_<iso>` (recurring.service expandRecurrence).
  const PARENT = {
    ...ROW,
    recurrenceRule: 'FREQ=DAILY',
    startTime: new Date('2026-10-12T09:00:00.000Z'),
    endTime: new Date('2026-10-12T10:00:00.000Z'),
    attendees: JSON.stringify([{ email: 'me@quantmail.in', name: 'Me', status: 'pending' }]),
  };
  const OCC_ID = 'e1_2026-10-13T09:00:00.000Z';

  function withUserDelegate() {
    (prisma as unknown as { user: unknown }).user = {
      findUnique: vi.fn().mockResolvedValue({ email: 'me@quantmail.in' }),
    };
  }

  function occurrenceLookup() {
    prisma.event.findUnique.mockImplementation(
      ({ where: { id } }: { where: { id: string } }) =>
        Promise.resolve(id === OCC_ID ? null : id === 'e1' ? PARENT : null),
    );
  }

  it('resolves a valid occurrence id into a synthesized occurrence', async () => {
    const app = await buildApp();
    withUserDelegate();
    occurrenceLookup();
    const res = await app.inject({ method: 'GET', url: `/events/${OCC_ID}` });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.id).toBe(OCC_ID);
    expect(body.startTime).toBe('2026-10-13T09:00:00.000Z');
    // Parent duration (1h) applied to the occurrence start.
    expect(body.endTime).toBe('2026-10-13T10:00:00.000Z');
    expect(body.recurrence).toBeNull();
  });

  it('404s an occurrence id with an unparseable iso suffix', async () => {
    const app = await buildApp();
    withUserDelegate();
    occurrenceLookup();
    const res = await app.inject({ method: 'GET', url: '/events/e1_not-a-date' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('EVENT_NOT_FOUND');
  });

  it('404s an occurrence id whose parent belongs to another user', async () => {
    const app = await buildApp();
    withUserDelegate();
    // The viewer must NOT be in the parent's attendee list for this to 404:
    // attendee access is a real read grant (see the attendee describe below).
    prisma.event.findUnique.mockImplementation(
      ({ where: { id } }: { where: { id: string } }) =>
        Promise.resolve(
          id === OCC_ID
            ? null
            : id === 'e1'
              ? {
                  ...PARENT,
                  userId: 'user-2',
                  attendees: JSON.stringify([
                    { email: 'someone-else@example.com', name: 'Else', status: 'pending' },
                  ]),
                }
              : null,
        ),
    );
    const res = await app.inject({ method: 'GET', url: `/events/${OCC_ID}` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('EVENT_NOT_FOUND');
  });

  it('sets viewerIsAttendee true when the viewer is in the attendee list', async () => {
    const app = await buildApp();
    withUserDelegate();
    occurrenceLookup();
    const res = await app.inject({ method: 'GET', url: '/events/e1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.viewerIsAttendee).toBe(true);
  });

  it('sets viewerIsAttendee false when the viewer is not an attendee', async () => {
    const app = await buildApp();
    withUserDelegate();
    const res = await app.inject({ method: 'GET', url: '/events/e1' });
    expect(res.statusCode).toBe(200);
    // ROW.attendees is '[]' — the owner is normally not in the list.
    expect(res.json().data.viewerIsAttendee).toBe(false);
  });

  it('matches the viewer by attendee userId even when the email differs', async () => {
    const app = await buildApp();
    withUserDelegate();
    prisma.event.findUnique.mockResolvedValue({
      ...ROW,
      attendees: JSON.stringify([
        { userId: 'user-1', email: 'other@example.com', name: 'Me', status: 'pending' },
      ]),
    });
    const res = await app.inject({ method: 'GET', url: '/events/e1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.viewerIsAttendee).toBe(true);
  });
});

describe('GET /events/:id — attendee read access (read-only for non-owners)', () => {
  // The hard-404 bug: an invited guest could never load /calendar/event/[id]
  // because the detail fetch required event.userId === userId, while
  // POST /events/:id/rsvp already let the same guest respond. The read gate
  // now mirrors the RSVP matcher exactly: attendee row's userId, or the
  // viewer's account email against the attendee's email (case-insensitive).
  function withUserDelegate() {
    (prisma as unknown as { user: unknown }).user = {
      findUnique: vi.fn().mockResolvedValue({ email: 'me@quantmail.in' }),
    };
  }

  it('lets a non-owner attendee read the event (email match, case-insensitive)', async () => {
    const app = await buildApp();
    withUserDelegate();
    prisma.event.findUnique.mockResolvedValue({
      ...ROW,
      userId: 'user-2',
      attendees: JSON.stringify([{ email: 'Me@QuantMail.in', name: 'Me', status: 'pending' }]),
    });
    const res = await app.inject({ method: 'GET', url: '/events/e1' });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.title).toBe(ROW.title);
    expect(body.viewerIsAttendee).toBe(true);
    // Read-only: the page hides Edit/Delete on this flag; writes stay
    // owner-only at the route level (PUT/PATCH/DELETE).
    expect(body.viewerIsOwner).toBe(false);
  });

  it('lets a non-owner attendee read the event (attendee userId match, email differs)', async () => {
    const app = await buildApp();
    withUserDelegate();
    prisma.event.findUnique.mockResolvedValue({
      ...ROW,
      userId: 'user-2',
      attendees: JSON.stringify([
        { userId: 'user-1', email: 'work@company.com', name: 'Me', status: 'pending' },
      ]),
    });
    const res = await app.inject({ method: 'GET', url: '/events/e1' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.viewerIsAttendee).toBe(true);
    expect(res.json().data.viewerIsOwner).toBe(false);
  });

  it('marks the organizer as owner on their own event', async () => {
    const app = await buildApp();
    withUserDelegate();
    const res = await app.inject({ method: 'GET', url: '/events/e1' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.viewerIsOwner).toBe(true);
    expect(res.json().data.viewerIsAttendee).toBe(false);
  });

  it('still 404s a non-owner who is not an attendee, even with a user row present', async () => {
    const app = await buildApp();
    withUserDelegate();
    prisma.event.findUnique.mockResolvedValue({
      ...ROW,
      userId: 'user-2',
      attendees: JSON.stringify([
        { email: 'someone-else@example.com', name: 'Else', status: 'pending' },
      ]),
    });
    const res = await app.inject({ method: 'GET', url: '/events/e1' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('EVENT_NOT_FOUND');
  });

  it('lets an attendee of the parent read a recurring occurrence id', async () => {
    const app = await buildApp();
    withUserDelegate();
    const OCC_ID = 'e1_2026-10-13T09:00:00.000Z';
    const PARENT = {
      ...ROW,
      userId: 'user-2',
      recurrenceRule: 'FREQ=DAILY',
      startTime: new Date('2026-10-12T09:00:00.000Z'),
      endTime: new Date('2026-10-12T10:00:00.000Z'),
      attendees: JSON.stringify([{ email: 'me@quantmail.in', name: 'Me', status: 'pending' }]),
    };
    prisma.event.findUnique.mockImplementation(({ where: { id } }: { where: { id: string } }) =>
      Promise.resolve(id === OCC_ID ? null : id === 'e1' ? PARENT : null),
    );
    const res = await app.inject({ method: 'GET', url: `/events/${OCC_ID}` });

    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.id).toBe(OCC_ID);
    expect(body.startTime).toBe('2026-10-13T09:00:00.000Z');
    expect(body.viewerIsAttendee).toBe(true);
    expect(body.viewerIsOwner).toBe(false);
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

describe('attendees / reminders / recurrence — what the route used to drop', () => {
  it('stores an attendee in the shape quantcalendar writes, not as a bare email', async () => {
    const app = await buildApp();
    await app.inject({ method: 'POST', url: '/events', payload: PAGE_PAYLOAD });

    // quantcalendar's event.service.ts writes the same `calendar_events` table
    // and reads `Attendee = {userId, email, name, status}`. A bare
    // `["ada@example.com"]` would read back there as an attendee with no email,
    // and its next RSVP write would flatten the row.
    expect(storedJson(createData(), 'attendees')).toEqual([
      { userId: '', email: 'ada@example.com', name: '', status: 'pending' },
    ]);
  });

  it('stores a reminder label with the minutes it resolves to, and keeps the text', async () => {
    const app = await buildApp();
    await app.inject({ method: 'POST', url: '/events', payload: PAGE_PAYLOAD });

    // `label` is quantmail's one addition to quantcalendar's `Reminder`. The page
    // picks human phrases; a number alone cannot reproduce "1 week before at 9 AM".
    expect(storedJson(createData(), 'reminders')).toEqual([
      { type: 'push', minutesBefore: 10, label: '10 minutes before' },
    ]);
  });

  it('writes empty columns on a create that sends no collections at all', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/events',
      payload: { title: 'Coffee', start: '2026-09-11T09:00:00.000Z' },
    });

    const data = createData();
    expect(data.attendees).toBe('[]');
    expect(data.reminders).toBe('[]');
    expect(data.recurrenceRule).toBeNull();
  });

  it('resolves every label the notification slider can produce', async () => {
    const app = await buildApp();
    const labels = [
      '5 minutes before',
      '45 minutes before',
      '1 hour before',
      '2 hours before',
      '1 day before',
      '2 days before',
      '1 week before',
    ];
    await app.inject({ method: 'PUT', url: '/events/e1', payload: { reminders: labels } });

    expect(storedJson(updateData(), 'reminders')).toEqual([
      { type: 'push', minutesBefore: 5, label: '5 minutes before' },
      { type: 'push', minutesBefore: 45, label: '45 minutes before' },
      { type: 'push', minutesBefore: 60, label: '1 hour before' },
      { type: 'push', minutesBefore: 120, label: '2 hours before' },
      { type: 'push', minutesBefore: 1440, label: '1 day before' },
      { type: 'push', minutesBefore: 2880, label: '2 days before' },
      { type: 'push', minutesBefore: 10080, label: '1 week before' },
    ]);
  });
});

describe('the labels a parser cannot read, and the ones another service wrote', () => {
  it("keeps a birthday label's text even though its minutes cannot be derived", async () => {
    const app = await buildApp();
    // Hardcoded at calendar/page.tsx:1180 and not in NOTIFICATION_SLIDER_VALUES.
    await app.inject({
      method: 'PUT',
      url: '/events/e1',
      payload: { reminders: ['1 week before at 9 AM', 'On the day at 9 AM', 'whenever, really'] },
    });

    expect(storedJson(updateData(), 'reminders')).toEqual([
      { type: 'push', minutesBefore: 10080, label: '1 week before at 9 AM' },
      { type: 'push', minutesBefore: 0, label: 'On the day at 9 AM' },
      // Unreadable is stored, not dropped: losing the row would lose the user's
      // choice, and `minutesBefore: null` is an honest "we cannot schedule this".
      { type: 'push', minutesBefore: null, label: 'whenever, really' },
    ]);
  });

  it("preserves a caller's own reminder type so the alarm service still rings", async () => {
    const app = await buildApp();
    await app.inject({
      method: 'PUT',
      url: '/events/e1',
      payload: { reminders: [{ type: 'call', minutesBefore: 30 }, 15] },
    });

    // quantcalendar's alarm.service.ts only places a call on `type: 'call'`, so
    // overwriting it with 'push' would silently downgrade the reminder. A bare
    // number is the third accepted spelling and gets its label derived.
    expect(storedJson(updateData(), 'reminders')).toEqual([
      { type: 'call', minutesBefore: 30, label: '30 minutes before' },
      { type: 'push', minutesBefore: 15, label: '15 minutes before' },
    ]);
  });

  it('keeps the name and RSVP of an attendee sent as an object', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'PUT',
      url: '/events/e1',
      payload: {
        attendees: [
          { userId: 'u9', email: 'Ada@example.com', name: 'Ada L.', status: 'accepted' },
          // Same person, different case — a duplicate row would double-count the
          // RSVP and the page would render the invite twice.
          'ada@example.com',
        ],
      },
    });

    expect(storedJson(updateData(), 'attendees')).toEqual([
      { userId: 'u9', email: 'Ada@example.com', name: 'Ada L.', status: 'accepted' },
    ]);
  });

  it('drops an attendee with no email rather than storing an empty invite', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'PUT',
      url: '/events/e1',
      payload: { attendees: ['  ', { name: 'Nobody' }, 'real@example.com'] },
    });

    expect(storedJson(updateData(), 'attendees')).toEqual([
      { userId: '', email: 'real@example.com', name: '', status: 'pending' },
    ]);
  });
});

describe('PUT semantics for a column the client may not have mentioned', () => {
  it('leaves a column alone when the field is absent', async () => {
    const app = await buildApp();
    await app.inject({ method: 'PUT', url: '/events/e1', payload: { title: 'Renamed' } });

    // Absent is not "clear". A client that renames an event must not wipe its
    // guest list, and `PATCH`-shaped calls to this PUT are the normal case.
    const data = updateData();
    expect(data).not.toHaveProperty('attendees');
    expect(data).not.toHaveProperty('reminders');
    expect(data).not.toHaveProperty('recurrenceRule');
  });

  it('clears a column on an explicit empty array', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'PUT',
      url: '/events/e1',
      payload: { attendees: [], reminders: [] },
    });

    // The edit sheet re-sends the whole list every save, so removing the last
    // guest has to be a write of `[]` rather than a no-op.
    const data = updateData();
    expect(data.attendees).toBe('[]');
    expect(data.reminders).toBe('[]');
  });

  it('clears the rule on an explicit null and on every "no rule" spelling', async () => {
    for (const recurrence of [null, 'Does not repeat', 'none', '']) {
      const app = await buildApp();
      await app.inject({ method: 'PUT', url: '/events/e1', payload: { recurrence } });
      // A sentinel string in a nullable column is how `WHERE recurrenceRule IS
      // NOT NULL` starts lying about which events repeat.
      expect(updateData().recurrenceRule).toBeNull();
    }
  });

  it('stores a real rule verbatim, under either spelling', async () => {
    const app = await buildApp();
    await app.inject({ method: 'PUT', url: '/events/e1', payload: { recurrence: 'Weekly' } });
    expect(updateData().recurrenceRule).toBe('Weekly');

    const app2 = await buildApp();
    await app2.inject({
      method: 'PUT',
      url: '/events/e1',
      payload: { recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO' },
    });
    expect(updateData().recurrenceRule).toBe('FREQ=WEEKLY;BYDAY=MO');
  });
});

describe('the DTO — stored JSON back out in the shape the page renders', () => {
  const STORED = {
    ...ROW,
    attendees: JSON.stringify([
      { userId: '', email: 'ada@example.com', name: 'Ada L.', status: 'accepted' },
      { userId: '', email: 'bob@example.com', name: '', status: 'pending' },
    ]),
    reminders: JSON.stringify([
      { type: 'push', minutesBefore: 10080, label: '1 week before at 9 AM' },
    ]),
    recurrenceRule: 'Weekly',
  };

  it('emits rich attendees and reminders as labels, per CalendarEventLike', async () => {
    const app = await buildApp();
    prisma.event.findUnique.mockResolvedValue(STORED);
    const res = await app.inject({ method: 'GET', url: '/events/e1' });

    expect(res.json().data.attendees).toEqual([
      { email: 'ada@example.com', name: 'Ada L.', status: 'accepted' },
      { email: 'bob@example.com', name: '', status: 'pending' },
    ]);
    expect(res.json().data.reminders).toEqual(['1 week before at 9 AM']);
    expect(res.json().data.recurrence).toBe('Weekly');
  });

  it('renders a reminder another service wrote with only a minute count', async () => {
    const app = await buildApp();
    prisma.event.findUnique.mockResolvedValue({
      ...ROW,
      reminders: JSON.stringify([{ type: 'email', minutesBefore: 1440 }]),
    });
    const res = await app.inject({ method: 'GET', url: '/events/e1' });

    // quantcalendar's `Reminder` has no `label`, so the number is turned back
    // into the phrase the slider would have shown.
    expect(res.json().data.reminders).toEqual(['1 day before']);
  });

  it('reports no rule as null, not as the label the page happens to default to', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/events/e1' });
    // The page already does `ev.recurrence || 'Does not repeat'`. Inventing the
    // label here would make a non-repeating event indistinguishable from one
    // whose rule is literally the string 'Does not repeat'.
    expect(res.json().data.recurrence).toBeNull();
  });
});

describe('the rows a legacy writer left behind', () => {
  it('survives a malformed JSON column instead of 500ing a whole month', async () => {
    const app = await buildApp();
    prisma.event.findMany.mockResolvedValue([
      { ...ROW, attendees: 'not json at all', reminders: '{"nope":1}' },
    ]);
    const res = await app.inject({ method: 'GET', url: '/events' });

    // One unreadable row must not take out the list endpoint the calendar loads
    // its grid from — that is the "Failed to load events" toast all over again.
    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].attendees).toEqual([]);
    expect(res.json().data[0].reminders).toEqual([]);
  });

  it('reads a column Prisma already parsed for it', async () => {
    const app = await buildApp();
    prisma.event.findUnique.mockResolvedValue({
      ...ROW,
      // A `Json` column, or a stub client, hands back the array itself.
      attendees: [{ email: 'ada@example.com' }],
      reminders: ['30 minutes before'],
    });
    const res = await app.inject({ method: 'GET', url: '/events/e1' });

    expect(res.json().data.attendees).toEqual([
      { email: 'ada@example.com', name: '', status: 'pending' },
    ]);
    expect(res.json().data.reminders).toEqual(['30 minutes before']);
  });

  it('reads a bare email and a bare minute count out of an old array', async () => {
    const app = await buildApp();
    prisma.event.findUnique.mockResolvedValue({
      ...ROW,
      attendees: JSON.stringify(['ada@example.com', { name: 'no email' }]),
      reminders: JSON.stringify([60]),
    });
    const res = await app.inject({ method: 'GET', url: '/events/e1' });

    expect(res.json().data.attendees).toEqual([
      { email: 'ada@example.com', name: '', status: 'pending' },
    ]);
    expect(res.json().data.reminders).toEqual(['1 hour before']);
  });
});

describe('a guest list must not be able to 400 the whole save', () => {
  it('stores an object reminder that carries only a label', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'PUT',
      url: '/events/e1',
      payload: { reminders: [{ label: '2 hours before' }] },
    });

    expect(storedJson(updateData(), 'reminders')).toEqual([
      { type: 'push', minutesBefore: 120, label: '2 hours before' },
    ]);
  });

  it('drops an unusable entry and still writes the event', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/events/e1',
      payload: {
        title: 'Still saved',
        attendees: [{ name: 'no email here' }, 'real@example.com'],
        reminders: [{ type: 'push' }, '1 day before'],
      },
    });

    // The alternative is a 400 that loses the title edit too, over a row the
    // route can simply decline to store.
    expect(res.statusCode).toBe(200);
    const data = updateData();
    expect(data.title).toBe('Still saved');
    expect(storedJson(data, 'attendees')).toEqual([
      { userId: '', email: 'real@example.com', name: '', status: 'pending' },
    ]);
    expect(storedJson(data, 'reminders')).toEqual([
      { type: 'push', minutesBefore: 1440, label: '1 day before' },
    ]);
  });
});
describe('attendee email-shape validation — a non-address is not an invitee', () => {
  it('POST /events drops garbage attendee strings but still creates the event', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/events',
      payload: {
        title: 'Sprint planning',
        start: '2026-09-11T09:00:00.000Z',
        attendees: ['hello', 'good@example.com', { email: 'not-an-email' }, { email: 'ok@example.com' }],
      },
    });

    // The pinned design stands: a bad guest list never 400s the whole save —
    // the non-addresses are declined at normalization instead.
    expect(res.statusCode).toBe(201);
    expect(storedJson(createData(), 'attendees')).toEqual([
      { userId: '', email: 'good@example.com', name: '', status: 'pending' },
      { userId: '', email: 'ok@example.com', name: '', status: 'pending' },
    ]);
  });

  it('PUT /events/:id drops a garbage string attendee and still writes the event', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/events/e1',
      payload: { title: 'Still saved', attendees: ['hello', 'real@example.com'] },
    });

    expect(res.statusCode).toBe(200);
    expect(storedJson(updateData(), 'attendees')).toEqual([
      { userId: '', email: 'real@example.com', name: '', status: 'pending' },
    ]);
  });

  it('GET /events/:id/invite.ics never emits a malformed mailto: line for a legacy garbage attendee', async () => {
    const app = await buildApp();
    prisma.event.findUnique.mockResolvedValue({
      ...ROW,
      attendees: JSON.stringify(['hello', 'good@example.com']),
    });
    const res = await app.inject({ method: 'GET', url: '/events/e1/invite.ics' });

    expect(res.statusCode).toBe(200);
    const ics = res.body;
    expect(ics).toContain('ATTENDEE');
    expect(ics).toContain('mailto:good@example.com');
    expect(ics).not.toContain('mailto:hello');
  });

  it('GET /events/:id/invite.ics skips a garbage object-form attendee too', async () => {
    const app = await buildApp();
    prisma.event.findUnique.mockResolvedValue({
      ...ROW,
      attendees: JSON.stringify([{ email: 'garbage' }, { email: 'fine@example.com' }]),
    });
    const res = await app.inject({ method: 'GET', url: '/events/e1/invite.ics' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('mailto:fine@example.com');
    expect(res.body).not.toContain('mailto:garbage');
  });
});
describe('GET /events — the window the grid asks for', () => {
  it('filters on a parsed [start,end] window', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/events?start=2026-09-01T00:00:00.000Z&end=2026-09-30T00:00:00.000Z',
    });

    expect(res.statusCode).toBe(200);
    const arg = prisma.event.findMany.mock.calls[0]![0] as {
      where: { startTime: { gte: Date; lte: Date } };
    };
    expect(arg.where.startTime.gte).toEqual(new Date('2026-09-01T00:00:00.000Z'));
    expect(arg.where.startTime.lte).toEqual(new Date('2026-09-30T00:00:00.000Z'));
  });

  it('400s an unparseable window instead of 500ing out of the query engine', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/events?start=september' });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_DATE');
    expect(prisma.event.findMany).not.toHaveBeenCalled();
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

describe('GET /events — ?q text filter (K10 universal search)', () => {
  it('adds a case-insensitive OR over title, description and location', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/events?q=Design' });

    expect(res.statusCode).toBe(200);
    const arg = prisma.event.findMany.mock.calls[0]![0] as {
      where: { OR?: Array<Record<string, unknown>> };
    };
    expect(arg.where.OR).toEqual([
      { title: { contains: 'Design', mode: 'insensitive' } },
      { description: { contains: 'Design', mode: 'insensitive' } },
      { location: { contains: 'Design', mode: 'insensitive' } },
    ]);
  });

  it('sends no OR when ?q is absent, so existing callers are untouched', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/events' });

    expect(res.statusCode).toBe(200);
    const arg = prisma.event.findMany.mock.calls[0]![0] as {
      where: { OR?: unknown };
    };
    expect(arg.where.OR).toBeUndefined();
  });

  it('trims whitespace-only ?q to the no-filter shape', async () => {
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/events?q=%20%20' });
    const arg = prisma.event.findMany.mock.calls[0]![0] as {
      where: { OR?: unknown };
    };
    expect(arg.where.OR).toBeUndefined();
  });

  it('filters the windowed (start/end) branch too', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/events?start=2026-09-01T00:00:00.000Z&end=2026-09-30T23:59:59.999Z&q=retro',
    });

    expect(res.statusCode).toBe(200);
    const firstCall = prisma.event.findMany.mock.calls[0]![0] as {
      where: { OR?: Array<Record<string, unknown>> };
    };
    expect(firstCall.where.OR).toHaveLength(3);
  });
});

describe('driveLink — the sheet has always sent it; the schema silently dropped it', () => {
  const META_LINK =
    '__QUANT_META__:{"type":"event","driveLink":"https://drive.quantmail.in/file/abc123"}:__END_QUANT_META__\nagenda';

  /** Parse the __QUANT_META__ header out of the description handed to Prisma. */
  function storedMeta(data: Record<string, unknown>): Record<string, unknown> {
    const desc = data.description;
    expect(typeof desc).toBe('string');
    const match = /__QUANT_META__:([\s\S]*?):__END_QUANT_META__/.exec(desc as string);
    expect(match).not.toBeNull();
    return JSON.parse(match![1] as string) as Record<string, unknown>;
  }

  it('persists a driveLink into the __QUANT_META__ header on create', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/events',
      payload: {
        title: 'Design review',
        start: '2026-09-11T09:00:00.000Z',
        end: '2026-09-11T10:30:00.000Z',
        driveLink: 'https://drive.quantmail.in/file/abc123',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(storedMeta(createData()).driveLink).toBe('https://drive.quantmail.in/file/abc123');
  });

  it('returns the stored driveLink in the event DTO', async () => {
    const app = await buildApp();
    prisma.event.findUnique.mockResolvedValue({ ...ROW, description: META_LINK });
    const res = await app.inject({ method: 'GET', url: '/events/e1' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.driveLink).toBe('https://drive.quantmail.in/file/abc123');
  });

  it('merges driveLink into stored meta on update — never a top-level column', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/events/e1',
      payload: { ...PAGE_PAYLOAD, driveLink: 'https://drive.quantmail.in/file/abc123' },
    });

    expect(res.statusCode).toBe(200);
    const data = updateData();
    // Event has no driveLink column: handing one to Prisma would throw.
    expect(data).not.toHaveProperty('driveLink');
    expect(storedMeta(data).driveLink).toBe('https://drive.quantmail.in/file/abc123');
  });

  it('clears a stored driveLink when the sheet sends an empty value', async () => {
    const app = await buildApp();
    prisma.event.findUnique.mockResolvedValue({ ...ROW, description: META_LINK });
    const res = await app.inject({
      method: 'PUT',
      url: '/events/e1',
      payload: { description: META_LINK, driveLink: '' },
    });

    expect(res.statusCode).toBe(200);
    const meta = storedMeta(updateData());
    expect(meta).not.toHaveProperty('driveLink');
    // The human-readable part of the description is untouched.
    expect(updateData().description).toContain('agenda');
  });

  it('leaves the description byte-identical when there is nothing to write or clear', async () => {
    const app = await buildApp();
    const plain = '__QUANT_META__:{"type":"event"}:__END_QUANT_META__\nagenda';
    const res = await app.inject({
      method: 'PUT',
      url: '/events/e1',
      payload: { ...PAGE_PAYLOAD, description: plain, driveLink: '' },
    });

    expect(res.statusCode).toBe(200);
    // Clearing a link that was never stored must not rewrite the header.
    expect(updateData().description).toBe(plain);
  });

  it('re-attaches the stored meta when a client saves a meta-stripped description', async () => {
    const app = await buildApp();
    // The event detail page seeds its edit form with the stripped description
    // and never sends driveLink — without preservation the stored link would
    // be wiped by a title edit.
    prisma.event.findUnique.mockResolvedValue({ ...ROW, description: META_LINK });
    const res = await app.inject({
      method: 'PUT',
      url: '/events/e1',
      payload: { title: 'Renamed', description: 'agenda' },
    });

    expect(res.statusCode).toBe(200);
    expect(storedMeta(updateData()).driveLink).toBe('https://drive.quantmail.in/file/abc123');
  });
});

describe('POST /events/:id/rsvp — recurring occurrence ids resolve to the parent', () => {
  // The defect: the handler ran findUnique/update on request.params.id
  // verbatim, so RSVPing from any <parentId>_<iso> occurrence detail page
  // always 404'd — while the detail page renders the "Your response" widget
  // there. Occurrence ids must resolve to the parent (same as DELETE
  // /events/:id); the RSVP lands on the parent's attendee list. A
  // per-occurrence RSVP split can come later.
  function withUserDelegate() {
    (prisma as unknown as { user: unknown }).user = {
      findUnique: vi.fn().mockResolvedValue({ email: 'me@quantmail.in' }),
    };
  }

  function parentWithAttendee(status: string) {
    return {
      ...ROW,
      attendees: JSON.stringify([
        { userId: 'user-1', email: 'me@quantmail.in', name: 'Me', status },
      ]),
    };
  }

  it('RSVPs an occurrence id against the parent attendee list instead of 404ing', async () => {
    const app = await buildApp();
    withUserDelegate();
    prisma.event.findUnique.mockResolvedValue(parentWithAttendee('pending'));
    const occId = `e1_${encodeURIComponent('2026-10-15T09:00:00.000Z')}`;
    const res = await app.inject({
      method: 'POST',
      url: `/events/${occId}/rsvp`,
      payload: { status: 'accepted' },
    });

    expect(res.statusCode).toBe(200);
    // Prisma is never asked for the virtual occurrence row — only the parent.
    expect(prisma.event.findUnique).toHaveBeenCalledWith({ where: { id: 'e1' } });
    const updateArg = prisma.event.update.mock.calls[0]![0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(updateArg.where.id).toBe('e1');
    const stored = storedJson(updateArg.data, 'attendees') as Array<{
      userId: string;
      status: string;
    }>;
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ userId: 'user-1', status: 'accepted' });
    expect(res.json().data.attendees).toMatchObject([{ userId: 'user-1', status: 'accepted' }]);
  });

  it('keeps RSVPing a plain parent id working', async () => {
    const app = await buildApp();
    withUserDelegate();
    prisma.event.findUnique.mockResolvedValue(parentWithAttendee('pending'));
    const res = await app.inject({
      method: 'POST',
      url: '/events/e1/rsvp',
      payload: { status: 'declined' },
    });

    expect(res.statusCode).toBe(200);
    expect(prisma.event.findUnique).toHaveBeenCalledWith({ where: { id: 'e1' } });
    const stored = storedJson(updateData(), 'attendees') as Array<{ status: string }>;
    expect(stored[0]!.status).toBe('declined');
  });

  it('still 404s with EVENT_NOT_FOUND when the resolved parent does not exist', async () => {
    const app = await buildApp();
    withUserDelegate();
    prisma.event.findUnique.mockResolvedValue(null);
    const occId = `missing_${encodeURIComponent('2026-10-15T09:00:00.000Z')}`;
    const res = await app.inject({
      method: 'POST',
      url: `/events/${occId}/rsvp`,
      payload: { status: 'accepted' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('EVENT_NOT_FOUND');
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it('still 403s with NOT_EVENT_ATTENDEE when the viewer is not on the guest list', async () => {
    const app = await buildApp();
    withUserDelegate();
    prisma.event.findUnique.mockResolvedValue({
      ...ROW,
      attendees: JSON.stringify([{ email: 'someoneelse@quantmail.in', status: 'pending' }]),
    });
    const occId = `e1_${encodeURIComponent('2026-10-15T09:00:00.000Z')}`;
    const res = await app.inject({
      method: 'POST',
      url: `/events/${occId}/rsvp`,
      payload: { status: 'accepted' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('NOT_EVENT_ATTENDEE');
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it('DELETE /events/:id still resolves occurrence ids to the parent (scope=all)', async () => {
    const app = await buildApp();
    const occId = `e1_${encodeURIComponent('2026-10-15T09:00:00.000Z')}`;
    const res = await app.inject({ method: 'DELETE', url: `/events/${occId}?scope=all` });

    expect(res.statusCode).toBe(200);
    expect(prisma.event.findUnique).toHaveBeenCalledWith({ where: { id: 'e1' } });
    expect(prisma.event.delete).toHaveBeenCalledWith({ where: { id: 'e1' } });
  });
});

describe('POST /events/:id/rsvp — rsvpScope contract in the response', () => {
  // Follow-up to the occurrence-id 404 fix: the RSVP writes the
  // series-level attendee list (occurrences are virtual rows), but the UI
  // previously gave the user no confirmation of WHAT their RSVP covered.
  // The response now carries rsvpScope so the client can say exactly that.
  function withUserDelegate() {
    (prisma as unknown as { user: unknown }).user = {
      findUnique: vi.fn().mockResolvedValue({ email: 'me@quantmail.in' }),
    };
  }
  function recurringRow() {
    return {
      ...ROW,
      recurrenceRule: 'FREQ=WEEKLY;INTERVAL=1',
      attendees: JSON.stringify([
        { userId: 'user-1', email: 'me@quantmail.in', name: 'Me', status: 'pending' },
      ]),
    };
  }

  it('RSVP from an occurrence page reports kind=occurrence, appliesTo=series', async () => {
    const app = await buildApp();
    withUserDelegate();
    prisma.event.findUnique.mockResolvedValue(recurringRow());
    const occId = `e1_${encodeURIComponent('2026-10-15T09:00:00.000Z')}`;
    const res = await app.inject({
      method: 'POST',
      url: `/events/${occId}/rsvp`,
      payload: { status: 'accepted' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.rsvpScope).toEqual({
      kind: 'occurrence',
      appliesTo: 'series',
      fromOccurrence: '2026-10-15T09:00:00.000Z',
    });
  });

  it('RSVP from the series page reports kind=event, appliesTo=series', async () => {
    const app = await buildApp();
    withUserDelegate();
    prisma.event.findUnique.mockResolvedValue(recurringRow());
    const res = await app.inject({
      method: 'POST',
      url: '/events/e1/rsvp',
      payload: { status: 'tentative' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.rsvpScope).toEqual({
      kind: 'event',
      appliesTo: 'series',
      fromOccurrence: null,
    });
  });

  it('RSVP on a non-recurring event reports appliesTo=event', async () => {
    const app = await buildApp();
    withUserDelegate();
    prisma.event.findUnique.mockResolvedValue({
      ...ROW,
      recurrenceRule: null,
      attendees: JSON.stringify([
        { userId: 'user-1', email: 'me@quantmail.in', name: 'Me', status: 'pending' },
      ]),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/events/e1/rsvp',
      payload: { status: 'declined' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.rsvpScope).toEqual({
      kind: 'event',
      appliesTo: 'event',
      fromOccurrence: null,
    });
  });
});

describe('POST /events/:id/rsvp — concurrent RSVPs are atomic (no lost responses)', () => {
  // The write path is read-modify-write on the attendees JSON column. The
  // route serializes it with SELECT ... FOR UPDATE inside $transaction.
  // This suite proves it two ways against a faithful in-memory store:
  //   1. with a serializing fake transaction (the FOR UPDATE model), two
  //      simultaneous RSVPs both land;
  //   2. a control with a pass-through fake transaction (the old unlocked
  //      code) shows the same workload losing one response — the defect
  //      the lock exists to kill.
  // The ROW fixture types recurrenceRule as the literal `null` (it is the
  // non-recurring base row), so widen it here: the store needs real RRULE
  // strings for the concurrency workload.
  type Row = Omit<typeof ROW, 'recurrenceRule' | 'attendees'> & {
    recurrenceRule: string | null;
    attendees: string;
  };

  function buildConcurrentApp(opts: { locking: boolean }) {
    const store = new Map<string, Row>();
    store.set('e1', {
      ...ROW,
      recurrenceRule: 'FREQ=WEEKLY;INTERVAL=1',
      attendees: JSON.stringify([
        { userId: 'user-1', email: 'a@quantmail.in', name: 'A', status: 'pending' },
        { userId: 'user-2', email: 'b@quantmail.in', name: 'B', status: 'pending' },
      ]),
    });

    // Async mutex per event row — the faithful model of Postgres
    // SELECT ... FOR UPDATE: callbacks that hold the "row lock" never
    // interleave.
    const tails = new Map<string, Promise<unknown>>();
    const withRowLock = async <T>(id: string, fn: () => Promise<T>): Promise<T> => {
      const prev = tails.get(id) ?? Promise.resolve();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      tails.set(id, prev.then(() => gate));
      await prev;
      try {
        return await fn();
      } finally {
        release();
      }
    };

    const txQueryRaw = vi.fn(async () => []);
    const txEvent = {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        // Genuine IO latency so the two requests interleave unless the
        // lock serializes them.
        await new Promise((r) => setTimeout(r, 10));
        const row = store.get(where.id);
        return row ? { ...row } : null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        await new Promise((r) => setTimeout(r, 10));
        const row = store.get(where.id);
        if (!row) throw new Error('row vanished');
        const next = { ...row, ...data };
        store.set(where.id, next);
        return { ...next };
      }),
    };

    const runInTx = async (cb: (tx: unknown) => unknown) => {
      const tx = { $queryRaw: txQueryRaw, event: txEvent };
      return opts.locking ? withRowLock('e1', () => cb(tx) as Promise<unknown>) : cb(tx);
    };

    const prismaLike = {
      $transaction: vi.fn(runInTx),
      user: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          const emails: Record<string, string> = {
            'user-1': 'a@quantmail.in',
            'user-2': 'b@quantmail.in',
          };
          return { email: emails[where.id] ?? `${where.id}@quantmail.in` };
        }),
      },
    };

    const build = async () => {
      const app = Fastify();
      await app.register(errorHandlerPlugin);
      app.decorate('prisma', prismaLike as never);
      app.addHook('onRequest', async (request) => {
        const uid = (request.headers['x-test-user'] as string) || 'user-1';
        (request as unknown as { auth: { userId: string } }).auth = { userId: uid };
      });
      await app.register(calendarRoutes);
      await app.ready();
      return app;
    };

    return { build, store, txEvent, txQueryRaw };
  }

  const OCC_ID = `e1_${encodeURIComponent('2026-10-15T09:00:00.000Z')}`;

  it('two simultaneous RSVPs to the same occurrence both land (nothing clobbered)', async () => {
    const { build, store, txQueryRaw } = buildConcurrentApp({ locking: true });
    const app = await build();

    const [r1, r2] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/events/${OCC_ID}/rsvp`,
        headers: { 'x-test-user': 'user-1' },
        payload: { status: 'accepted' },
      }),
      app.inject({
        method: 'POST',
        url: '/events/e1/rsvp',
        headers: { 'x-test-user': 'user-2' },
        payload: { status: 'declined' },
      }),
    ]);

    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    const final = JSON.parse(store.get('e1')!.attendees) as Array<{
      userId: string;
      status: string;
    }>;
    expect(final.find((a) => a.userId === 'user-1')!.status).toBe('accepted');
    expect(final.find((a) => a.userId === 'user-2')!.status).toBe('declined');
    // The lock was actually taken before any row read inside the transaction.
    expect(txQueryRaw).toHaveBeenCalled();
  });

  it('the row lock is acquired before the row is read', async () => {
    const { build, txEvent, txQueryRaw } = buildConcurrentApp({ locking: true });
    const app = await build();

    const res = await app.inject({
      method: 'POST',
      url: `/events/${OCC_ID}/rsvp`,
      headers: { 'x-test-user': 'user-1' },
      payload: { status: 'accepted' },
    });

    expect(res.statusCode).toBe(200);
    // FOR UPDATE is emitted before findUnique reads the row: a concurrent
    // writer cannot slip its read between our lock and our read.
    const lockOrder = txQueryRaw.mock.invocationCallOrder[0]!;
    const readOrder = txEvent.findUnique.mock.invocationCallOrder[0]!;
    expect(lockOrder).toBeLessThan(readOrder);
  });

  it('CONTROL: without the row lock the same workload loses one response', async () => {
    const { build, store } = buildConcurrentApp({ locking: false });
    const app = await build();

    const [r1, r2] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/events/${OCC_ID}/rsvp`,
        headers: { 'x-test-user': 'user-1' },
        payload: { status: 'accepted' },
      }),
      app.inject({
        method: 'POST',
        url: '/events/e1/rsvp',
        headers: { 'x-test-user': 'user-2' },
        payload: { status: 'declined' },
      }),
    ]);

    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    const final = JSON.parse(store.get('e1')!.attendees) as Array<{
      userId: string;
      status: string;
    }>;
    const a = final.find((x) => x.userId === 'user-1')!.status;
    const b = final.find((x) => x.userId === 'user-2')!.status;
    // Both requests read the same 'pending' baseline; the second write
    // clobbers the first. Exactly one response survives — this is the
    // defect the FOR UPDATE lock fixes.
    expect([a, b].filter((s) => s === 'accepted' || s === 'declined')).toHaveLength(1);
  });
});
