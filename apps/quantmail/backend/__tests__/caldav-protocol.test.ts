import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fastify from 'fastify';
import davRoutes, { __setCalDavService } from '../routes/dav';
import { CalDavService } from '../services/caldav.service';

const SAMPLE_ICS =
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Test//CalDAV Test//EN',
    'BEGIN:VEVENT',
    'UID:event-123@quantmail.in',
    'DTSTAMP:20260923T120000Z',
    'DTSTART:20260925T140000Z',
    'DTEND:20260925T150000Z',
    'SUMMARY:Project Review Meeting',
    'DESCRIPTION:Quarterly review of team objectives',
    'LOCATION:Conference Room B',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n') + '\r\n';

function createMockPrisma() {
  const calendars = new Map<string, any>();
  const events = new Map<string, any>();

  return {
    calendar: {
      findFirst: async ({ where }: any) => {
        for (const cal of calendars.values()) {
          if (where.userId && cal.userId !== where.userId) continue;
          if (where.isPrimary && !cal.isPrimary) continue;
          if (where.OR) {
            const match = where.OR.some(
              (cond: any) => cond.id === cal.id || cond.name === cal.name,
            );
            if (match) return cal;
          } else if (where.id && cal.id === where.id) {
            return cal;
          }
          if (where.isPrimary && cal.isPrimary) return cal;
        }
        return null;
      },
      findMany: async ({ where }: any) => {
        const results = [];
        for (const cal of calendars.values()) {
          if (where.userId && cal.userId !== where.userId) continue;
          results.push(cal);
        }
        return results;
      },
      create: async ({ data }: any) => {
        const id = data.id || `cal-${calendars.size + 1}`;
        const record = { ...data, id, createdAt: new Date(), updatedAt: new Date() };
        calendars.set(id, record);
        return record;
      },
    },
    event: {
      findFirst: async ({ where }: any) => {
        for (const ev of events.values()) {
          if (where.userId && ev.userId !== where.userId) continue;
          if (where.OR) {
            const match = where.OR.some((cond: any) => cond.id === ev.id);
            if (match) return ev;
          } else if (where.id && ev.id === where.id) {
            return ev;
          }
        }
        return null;
      },
      findUnique: async ({ where }: any) => {
        return events.get(where.id) || null;
      },
      findMany: async ({ where }: any) => {
        const results = [];
        for (const ev of events.values()) {
          if (where.userId && ev.userId !== where.userId) continue;
          if (where.calendarId && ev.calendarId !== where.calendarId) continue;
          results.push(ev);
        }
        return results;
      },
      create: async ({ data }: any) => {
        const id = data.id || `ev-${events.size + 1}`;
        const record = { ...data, id, createdAt: new Date(), updatedAt: new Date() };
        events.set(id, record);
        return record;
      },
      update: async ({ where, data }: any) => {
        const existing = events.get(where.id);
        const updated = { ...existing, ...data, updatedAt: new Date() };
        events.set(where.id, updated);
        return updated;
      },
      delete: async ({ where }: any) => {
        const existing = events.get(where.id);
        events.delete(where.id);
        return existing;
      },
    },
  };
}

async function buildTestApp(userId: string = 'alice') {
  const app = fastify();
  for (const m of ['PROPFIND', 'REPORT', 'MKCALENDAR']) {
    try {
      app.addHttpMethod(m, { hasBody: true });
    } catch {}
  }
  app.addHook('preHandler', async (req) => {
    (req as unknown as { auth?: { userId?: string } }).auth = { userId };
  });
  await app.register(davRoutes, { prefix: '/dav' });
  await app.ready();
  return app;
}

describe('Task W33-05: Fastify CalDAV RFC 4791 Route Mounting & XML Multi-Status Serialization', () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let calDavService: CalDavService;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    calDavService = new CalDavService(mockPrisma);
    __setCalDavService(calDavService);
  });

  afterEach(() => {
    __setCalDavService(undefined);
  });

  it('1. OPTIONS /dav/calendars returns DAV compliance header and Allow methods', async () => {
    const app = await buildTestApp('alice');
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/dav/calendars',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['dav']).toBe('1, 2, 3, calendar-access, addressbook');
    expect(res.headers['allow']).toContain('PROPFIND');
    expect(res.headers['allow']).toContain('REPORT');
    expect(res.headers['allow']).toContain('MKCALENDAR');
  });

  it('2. PROPFIND /dav/calendars (Depth 0) returns 207 Multi-Status XML with calendar-home-set', async () => {
    const app = await buildTestApp('alice');
    const res = await app.inject({
      method: 'PROPFIND' as any,
      url: '/dav/calendars',
      headers: {
        depth: '0',
      },
    });

    expect(res.statusCode).toBe(207);
    expect(res.headers['content-type']).toContain('application/xml');
    expect(res.headers['dav']).toBe('1, 2, 3, calendar-access, addressbook');

    const body = res.body;
    expect(body).toContain('<D:multistatus');
    expect(body).toContain('xmlns:C="urn:ietf:params:xml:ns:caldav"');
    expect(body).toContain('<D:response>');
    expect(body).toContain('<D:href>/dav/calendars/alice/</D:href>');
    expect(body).toContain('<C:calendar-home-set>');
    expect(body).toContain('<D:current-user-principal>');
  });

  it('3. PROPFIND /dav/calendars/alice (Depth 1) returns user calendars with ctag and sync-token', async () => {
    const app = await buildTestApp('alice');
    const res = await app.inject({
      method: 'PROPFIND' as any,
      url: '/dav/calendars/alice',
      headers: {
        depth: '1',
      },
    });

    expect(res.statusCode).toBe(207);
    const body = res.body;
    expect(body).toContain('<D:resourcetype><D:collection/><C:calendar/></D:resourcetype>');
    expect(body).toContain('<CS:getctag>');
    expect(body).toContain('<D:sync-token>');
    expect(body).toContain('<D:displayname>Primary</D:displayname>');
  });

  it('4. MKCALENDAR /dav/calendars/alice/work-cal creates a new calendar collection', async () => {
    const app = await buildTestApp('alice');
    const res = await app.inject({
      method: 'MKCALENDAR' as any,
      url: '/dav/calendars/alice/work-cal',
    });

    expect(res.statusCode).toBe(201);
    const cal = await calDavService.getCalendar('alice', 'work-cal');
    expect(cal).toBeDefined();
    expect(cal?.name).toBe('work-cal');
  });

  it('5. PUT & GET /dav/calendars/alice/primary/event-123.ics creates and fetches event with VCALENDAR', async () => {
    const app = await buildTestApp('alice');
    // PUT event
    const putRes = await app.inject({
      method: 'PUT',
      url: '/dav/calendars/alice/primary/event-123.ics',
      headers: {
        'content-type': 'text/calendar; charset=utf-8',
      },
      body: SAMPLE_ICS,
    });

    expect([201, 204]).toContain(putRes.statusCode);
    expect(putRes.headers['etag']).toBeDefined();

    // GET event
    const getRes = await app.inject({
      method: 'GET',
      url: '/dav/calendars/alice/primary/event-123.ics',
    });

    expect(getRes.statusCode).toBe(200);
    expect(getRes.headers['content-type']).toContain('text/calendar');
    expect(getRes.body).toContain('BEGIN:VCALENDAR');
    expect(getRes.body).toContain('SUMMARY:Project Review Meeting');
  });

  it('6. REPORT /dav/calendars/alice/primary returns 207 Multi-Status with <C:calendar-data>', async () => {
    await calDavService.upsertEventFromIcs('alice', 'primary', 'event-123', SAMPLE_ICS);

    const app = await buildTestApp('alice');
    const reportRes = await app.inject({
      method: 'REPORT' as any,
      url: '/dav/calendars/alice/primary',
      headers: {
        'content-type': 'application/xml; charset=utf-8',
      },
      body: '<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav"/>',
    });

    expect(reportRes.statusCode).toBe(207);
    expect(reportRes.headers['content-type']).toContain('application/xml');
    const body = reportRes.body;
    expect(body).toContain('<D:response>');
    expect(body).toContain('<D:getetag>');
    expect(body).toContain('<C:calendar-data>');
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('SUMMARY:Project Review Meeting');
  });

  it('7. DELETE /dav/calendars/alice/primary/event-123.ics removes the event', async () => {
    await calDavService.upsertEventFromIcs('alice', 'primary', 'event-123', SAMPLE_ICS);

    const app = await buildTestApp('alice');
    const delRes = await app.inject({
      method: 'DELETE',
      url: '/dav/calendars/alice/primary/event-123.ics',
    });

    expect(delRes.statusCode).toBe(204);

    const getRes = await app.inject({
      method: 'GET',
      url: '/dav/calendars/alice/primary/event-123.ics',
    });
    expect(getRes.statusCode).toBe(404);
  });
});
