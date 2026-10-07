import { z } from 'zod';
import { VCalSerializer, CalendarEventSchema } from './vcal-serializer.js';
import type { CalendarEvent } from './vcal-serializer.js';

export const CalendarCollectionSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
  color: z.string().optional(),
  ownerPrincipal: z.string(),
});

export type CalendarCollection = z.infer<typeof CalendarCollectionSchema>;

export interface CalDAVResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

export interface CalDAVRequest {
  method: 'PROPFIND' | 'REPORT' | 'PUT' | 'DELETE' | 'GET';
  path: string;
  body?: string;
  headers?: Record<string, string>;
}

export interface ICalDAVStorage {
  getCalendars(principal?: string): Promise<CalendarCollection[]> | CalendarCollection[];
  getCalendar(calendarId: string): Promise<CalendarCollection | null> | CalendarCollection | null;
  saveCalendar(calendar: CalendarCollection): Promise<void> | void;
  getEvents(calendarId: string): Promise<CalendarEvent[]> | CalendarEvent[];
  getEvent(calendarId: string, uid: string): Promise<CalendarEvent | null> | CalendarEvent | null;
  saveEvent(calendarId: string, event: CalendarEvent): Promise<boolean> | boolean;
  deleteEvent(calendarId: string, uid: string): Promise<boolean> | boolean;
  getSyncToken(calendarId: string): Promise<string> | string;
}

export class InMemoryCalDAVStorage implements ICalDAVStorage {
  private calendars = new Map<string, CalendarCollection>();
  private events = new Map<string, Map<string, CalendarEvent>>();
  private syncTokens = new Map<string, string>();

  getCalendars(principal?: string): CalendarCollection[] {
    const list = [...this.calendars.values()];
    if (principal) {
      return list.filter((c) => c.ownerPrincipal === principal);
    }
    return list;
  }

  getCalendar(calendarId: string): CalendarCollection | null {
    return this.calendars.get(calendarId) ?? null;
  }

  saveCalendar(calendar: CalendarCollection): void {
    this.calendars.set(calendar.id, calendar);
    if (!this.events.has(calendar.id)) {
      this.events.set(calendar.id, new Map());
    }
    this.syncTokens.set(calendar.id, `sync-${Date.now()}`);
  }

  getEvents(calendarId: string): CalendarEvent[] {
    const calEvents = this.events.get(calendarId);
    return calEvents ? [...calEvents.values()] : [];
  }

  getEvent(calendarId: string, uid: string): CalendarEvent | null {
    const calEvents = this.events.get(calendarId);
    return calEvents?.get(uid) ?? null;
  }

  saveEvent(calendarId: string, event: CalendarEvent): boolean {
    let calEvents = this.events.get(calendarId);
    if (!calEvents) {
      calEvents = new Map();
      this.events.set(calendarId, calEvents);
    }
    const isNew = !calEvents.has(event.uid);
    calEvents.set(event.uid, event);
    this.syncTokens.set(calendarId, `sync-${Date.now()}`);
    return isNew;
  }

  deleteEvent(calendarId: string, uid: string): boolean {
    const calEvents = this.events.get(calendarId);
    if (!calEvents || !calEvents.has(uid)) return false;
    const deleted = calEvents.delete(uid);
    this.syncTokens.set(calendarId, `sync-${Date.now()}`);
    return deleted;
  }

  getSyncToken(calendarId: string): string {
    return this.syncTokens.get(calendarId) ?? `sync-${Date.now()}`;
  }
}

/**
 * Persistent PostgreSQL-ready database adapter for RFC 4791 CalDAV server.
 */
export class DatabaseCalDAVStorage implements ICalDAVStorage {
  constructor(private readonly dbClient?: any) {}

  async getCalendars(principal?: string): Promise<CalendarCollection[]> {
    if (this.dbClient?.calendar) {
      const rows = await this.dbClient.calendar.findMany({
        where: principal ? { userId: principal } : undefined,
      });
      return rows.map((r: any) => ({
        id: r.id,
        displayName: r.name ?? 'Calendar',
        ownerPrincipal: r.userId,
        color: r.color ?? '#3b82f6',
      }));
    }
    return [];
  }

  async getCalendar(calendarId: string): Promise<CalendarCollection | null> {
    if (this.dbClient?.calendar) {
      const r = await this.dbClient.calendar.findUnique({ where: { id: calendarId } });
      if (!r) return null;
      return {
        id: r.id,
        displayName: r.name ?? 'Calendar',
        ownerPrincipal: r.userId,
        color: r.color ?? '#3b82f6',
      };
    }
    return null;
  }

  async saveCalendar(calendar: CalendarCollection): Promise<void> {
    if (this.dbClient?.calendar) {
      await this.dbClient.calendar.upsert({
        where: { id: calendar.id },
        create: {
          id: calendar.id,
          name: calendar.displayName,
          userId: calendar.ownerPrincipal,
          color: calendar.color ?? '#3b82f6',
        },
        update: {
          name: calendar.displayName,
          color: calendar.color ?? '#3b82f6',
        },
      });
    }
  }

  async getEvents(calendarId: string): Promise<CalendarEvent[]> {
    if (this.dbClient?.event) {
      const rows = await this.dbClient.event.findMany({ where: { calendarId } });
      return rows.map((r: any) => ({
        uid: r.id,
        summary: r.title,
        dtstart: r.startTime ? new Date(r.startTime).toISOString() : '',
        dtend: r.endTime ? new Date(r.endTime).toISOString() : '',
        description: r.description ?? undefined,
        location: r.location ?? undefined,
      }));
    }
    return [];
  }

  async getEvent(calendarId: string, uid: string): Promise<CalendarEvent | null> {
    if (this.dbClient?.event) {
      const r = await this.dbClient.event.findFirst({ where: { id: uid, calendarId } });
      if (!r) return null;
      return {
        uid: r.id,
        summary: r.title,
        dtstart: r.startTime ? new Date(r.startTime).toISOString() : '',
        dtend: r.endTime ? new Date(r.endTime).toISOString() : '',
        description: r.description ?? undefined,
        location: r.location ?? undefined,
      };
    }
    return null;
  }

  async saveEvent(calendarId: string, event: CalendarEvent): Promise<boolean> {
    if (this.dbClient?.event) {
      const existing = await this.dbClient.event.findUnique({ where: { id: event.uid } });
      await this.dbClient.event.upsert({
        where: { id: event.uid },
        create: {
          id: event.uid,
          calendarId,
          title: event.summary,
          startTime: new Date(event.dtstart),
          endTime: new Date(event.dtend),
          description: event.description,
          location: event.location,
        },
        update: {
          title: event.summary,
          startTime: new Date(event.dtstart),
          endTime: new Date(event.dtend),
          description: event.description,
          location: event.location,
        },
      });
      return !existing;
    }
    return true;
  }

  async deleteEvent(calendarId: string, uid: string): Promise<boolean> {
    if (this.dbClient?.event) {
      const res = await this.dbClient.event.deleteMany({ where: { id: uid, calendarId } });
      return res.count > 0;
    }
    return false;
  }

  async getSyncToken(calendarId: string): Promise<string> {
    return `sync-${calendarId}-${Date.now()}`;
  }
}

export class CalDAVServer {
  private readonly storage: ICalDAVStorage;
  private serializer: VCalSerializer;

  constructor(storage?: ICalDAVStorage) {
    this.storage = storage ?? new InMemoryCalDAVStorage();
    this.serializer = new VCalSerializer();
  }

  createCalendar(calendar: CalendarCollection): void {
    const parsed = CalendarCollectionSchema.parse(calendar);
    this.storage.saveCalendar(parsed);
  }

  handle(request: CalDAVRequest): CalDAVResponse {
    switch (request.method) {
      case 'PROPFIND':
        return this.handlePropfind(request.path, request.headers);
      case 'REPORT':
        return this.handleReport(request.path, request.body, request.headers);
      case 'PUT':
        return this.handlePut(request.path, request.body);
      case 'DELETE':
        return this.handleDelete(request.path);
      case 'GET':
        return this.handleGet(request.path);
      default:
        return { status: 405, body: 'Method Not Allowed', headers: {} };
    }
  }

  private isXmlPreferred(headers?: Record<string, string>): boolean {
    const accept = headers?.['accept']?.toLowerCase();
    if (!accept) return false;
    return accept.includes('xml') && !accept.includes('json');
  }

  private handlePropfind(path: string, headers?: Record<string, string>): CalDAVResponse {
    const calId = this.extractCalendarId(path);

    if (!calId) {
      const collections = (this.storage.getCalendars() as CalendarCollection[]).map((c) => ({
        href: `/calendars/${c.ownerPrincipal}/${c.id}/`,
        displayName: c.displayName,
        resourceType: 'calendar',
      }));

      if (this.isXmlPreferred(headers)) {
        const xmlResponses = collections
          .map(
            (c) => `  <D:response>
    <D:href>${c.href}</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>${c.displayName}</D:displayname>
        <D:resourcetype><D:collection/><C:calendar xmlns:C="urn:ietf:params:xml:ns:caldav"/></D:resourcetype>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`,
          )
          .join('\n');

        const xmlBody = `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
${xmlResponses}
</D:multistatus>`;

        return {
          status: 207,
          body: xmlBody,
          headers: { 'content-type': 'application/xml; charset=utf-8' },
        };
      }

      return {
        status: 207,
        body: JSON.stringify({ multistatus: { responses: collections } }),
        headers: { 'content-type': 'application/xml; charset=utf-8' },
      };
    }

    const calendar = this.storage.getCalendar(calId) as CalendarCollection | null;
    if (!calendar) {
      return { status: 404, body: 'Calendar not found', headers: {} };
    }

    const calEvents = (this.storage.getEvents(calId) as CalendarEvent[]) ?? [];
    const resources = calEvents.map((e) => ({
      href: `/calendars/${calendar.ownerPrincipal}/${calId}/${e.uid}.ics`,
      etag: `"${e.uid}-${Date.now()}"`,
    }));

    if (this.isXmlPreferred(headers)) {
      const xmlResponses = resources
        .map(
          (r) => `  <D:response>
    <D:href>${r.href}</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>${r.etag}</D:getetag>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`,
        )
        .join('\n');

      const xmlBody = `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
${xmlResponses}
</D:multistatus>`;

      return {
        status: 207,
        body: xmlBody,
        headers: { 'content-type': 'application/xml; charset=utf-8' },
      };
    }

    return {
      status: 207,
      body: JSON.stringify({
        multistatus: {
          calendar: { displayName: calendar.displayName, color: calendar.color },
          responses: resources,
        },
      }),
      headers: { 'content-type': 'application/xml; charset=utf-8' },
    };
  }

  private handleReport(
    path: string,
    body?: string,
    headers?: Record<string, string>,
  ): CalDAVResponse {
    const calId = this.extractCalendarId(path);
    if (!calId) {
      return { status: 400, body: 'Calendar ID required', headers: {} };
    }

    const calendar = this.storage.getCalendar(calId) as CalendarCollection | null;
    if (!calendar) {
      return { status: 404, body: 'Calendar not found', headers: {} };
    }

    let filteredEvents = (this.storage.getEvents(calId) as CalendarEvent[]) ?? [];

    if (body) {
      try {
        const filter = JSON.parse(body) as { timeRange?: { start: string; end: string } };
        if (filter.timeRange) {
          filteredEvents = filteredEvents.filter(
            (e) => e.dtstart >= filter.timeRange!.start && e.dtend <= filter.timeRange!.end,
          );
        }
      } catch {
        // no filter applied
      }
    }

    const results = filteredEvents.map((event) => ({
      href: `/calendars/${calId}/${event.uid}.ics`,
      data: this.serializer.serialize(event),
      etag: `"${event.uid}-${Date.now()}"`,
    }));

    if (this.isXmlPreferred(headers)) {
      const xmlResponses = results
        .map(
          (r) => `  <D:response>
    <D:href>${r.href}</D:href>
    <D:propstat>
      <D:prop>
        <D:getetag>${r.etag}</D:getetag>
        <C:calendar-data xmlns:C="urn:ietf:params:xml:ns:caldav"><![CDATA[${r.data}]]></C:calendar-data>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`,
        )
        .join('\n');

      const xmlBody = `<?xml version="1.0" encoding="utf-8" ?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
${xmlResponses}
</D:multistatus>`;

      return {
        status: 207,
        body: xmlBody,
        headers: { 'content-type': 'application/xml; charset=utf-8' },
      };
    }

    return {
      status: 207,
      body: JSON.stringify({ multistatus: { responses: results } }),
      headers: { 'content-type': 'application/xml; charset=utf-8' },
    };
  }

  private handlePut(path: string, body?: string): CalDAVResponse {
    if (!body) {
      return { status: 400, body: 'Request body required', headers: {} };
    }

    const calId = this.extractCalendarId(path);
    if (!calId) {
      return { status: 400, body: 'Calendar ID required', headers: {} };
    }

    const calendar = this.storage.getCalendar(calId);
    if (!calendar) {
      return { status: 404, body: 'Calendar not found', headers: {} };
    }

    const event = this.serializer.parse(body);
    if (!event) {
      return { status: 400, body: 'Invalid iCalendar data', headers: {} };
    }

    const parsed = CalendarEventSchema.safeParse(event);
    if (!parsed.success) {
      return { status: 400, body: 'Validation failed', headers: {} };
    }

    const isNew = this.storage.saveEvent(calId, parsed.data);

    return {
      status: isNew ? 201 : 204,
      body: '',
      headers: { etag: `"${parsed.data.uid}-${Date.now()}"` },
    };
  }

  private handleDelete(path: string): CalDAVResponse {
    const calId = this.extractCalendarId(path);
    const eventUid = this.extractEventUid(path);

    if (!calId) {
      return { status: 400, body: 'Calendar ID required', headers: {} };
    }

    const calendar = this.storage.getCalendar(calId);
    if (!calendar) {
      return { status: 404, body: 'Calendar not found', headers: {} };
    }

    if (!eventUid) {
      return { status: 404, body: 'Event not found', headers: {} };
    }

    const deleted = this.storage.deleteEvent(calId, eventUid);
    if (!deleted) {
      return { status: 404, body: 'Event not found', headers: {} };
    }

    return { status: 204, body: '', headers: {} };
  }

  private handleGet(path: string): CalDAVResponse {
    const calId = this.extractCalendarId(path);
    const eventUid = this.extractEventUid(path);

    if (!calId || !eventUid) {
      return { status: 400, body: 'Calendar and event ID required', headers: {} };
    }

    const calendar = this.storage.getCalendar(calId);
    if (!calendar) {
      return { status: 404, body: 'Calendar not found', headers: {} };
    }

    const event = this.storage.getEvent(calId, eventUid) as CalendarEvent | null;
    if (!event) {
      return { status: 404, body: 'Event not found', headers: {} };
    }

    return {
      status: 200,
      body: this.serializer.serialize(event),
      headers: { 'content-type': 'text/calendar; charset=utf-8' },
    };
  }

  private extractCalendarId(path: string): string | null {
    const match = /\/calendars\/[^/]+\/([^/]+)/.exec(path);
    return match?.[1] ?? null;
  }

  private extractEventUid(path: string): string | null {
    const match = /\/calendars\/[^/]+\/[^/]+\/([^/]+)\.ics/.exec(path);
    return match?.[1] ?? null;
  }

  getCalendars(): CalendarCollection[] {
    return this.storage.getCalendars() as CalendarCollection[];
  }

  getEvents(calendarId: string): CalendarEvent[] {
    return this.storage.getEvents(calendarId) as CalendarEvent[];
  }
}
