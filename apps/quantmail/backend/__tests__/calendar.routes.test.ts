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

  it('emits attendees as emails and reminders as labels, per CalendarEventLike', async () => {
    const app = await buildApp();
    prisma.event.findUnique.mockResolvedValue(STORED);
    const res = await app.inject({ method: 'GET', url: '/events/e1' });

    // `calendar/page.tsx` declares `attendees?: string[]` and `reminders?:
    // string[]`. Handing it objects would render "[object Object]" as a guest.
    expect(res.json().data.attendees).toEqual(['ada@example.com', 'bob@example.com']);
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

    expect(res.json().data.attendees).toEqual(['ada@example.com']);
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

    expect(res.json().data.attendees).toEqual(['ada@example.com']);
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
