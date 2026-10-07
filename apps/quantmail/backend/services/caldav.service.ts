// ============================================================================
// CalDAV Service (RFC 4791) — XML Multi-Status Serialization & Calendar Engine
// ============================================================================

export interface CalDavCalendar {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  isPrimary: boolean;
  ctag: string;
  syncToken: string;
}

export interface CalDavEvent {
  id: string;
  calendarId: string;
  title: string;
  description: string;
  location: string;
  startTime: Date;
  endTime: Date;
  allDay: boolean;
  recurrenceRule: string | null;
  status: string;
  attendees: any[];
  reminders: any[];
  etag: string;
  icsData: string;
  updatedAt: Date;
}

export function formatIcsDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

export function parseIcsDate(str: string): Date {
  const clean = str.trim();
  if (clean.length === 8) {
    // YYYYMMDD
    const y = parseInt(clean.slice(0, 4), 10);
    const m = parseInt(clean.slice(4, 6), 10) - 1;
    const d = parseInt(clean.slice(6, 8), 10);
    return new Date(Date.UTC(y, m, d));
  }
  // YYYYMMDDTHHMMSSZ or YYYYMMDDTHHMMSS
  const match = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?/);
  if (match) {
    const y = parseInt(match[1]!, 10);
    const m = parseInt(match[2]!, 10) - 1;
    const d = parseInt(match[3]!, 10);
    const h = parseInt(match[4]!, 10);
    const min = parseInt(match[5]!, 10);
    const s = parseInt(match[6]!, 10);
    return new Date(Date.UTC(y, m, d, h, min, s));
  }
  return new Date(clean);
}

export function escapeIcs(str: string): string {
  return (str || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export function unescapeIcs(str: string): string {
  return (str || '')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

export function generateEventIcs(event: {
  id: string;
  title: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime: Date;
  allDay?: boolean;
  recurrenceRule?: string | null;
  status?: string;
  attendees?: any;
}): string {
  const status = (event.status || 'confirmed').toUpperCase();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Quant Ecosystem//QuantCalendar CalDAV RFC 4791//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@quantmail.in`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(event.startTime)}`,
    `DTEND:${formatIcsDate(event.endTime)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `DESCRIPTION:${escapeIcs(event.description || '')}`,
    `LOCATION:${escapeIcs(event.location || '')}`,
    `STATUS:${status}`,
  ];

  if (event.recurrenceRule) {
    lines.push(`RRULE:${event.recurrenceRule}`);
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export function parseEventIcs(icsData: string): {
  uid?: string;
  title?: string;
  description?: string;
  location?: string;
  startTime?: Date;
  endTime?: Date;
  recurrenceRule?: string;
} {
  const result: ReturnType<typeof parseEventIcs> = {};
  const lines = icsData.replace(/\r\n /g, '').split(/\r?\n/);

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const rawKey = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1);
    const key = rawKey.split(';')[0]?.toUpperCase();

    if (key === 'UID') result.uid = value.replace(/@quantmail\.in$/i, '').trim();
    if (key === 'SUMMARY') result.title = unescapeIcs(value);
    if (key === 'DESCRIPTION') result.description = unescapeIcs(value);
    if (key === 'LOCATION') result.location = unescapeIcs(value);
    if (key === 'DTSTART') result.startTime = parseIcsDate(value);
    if (key === 'DTEND') result.endTime = parseIcsDate(value);
    if (key === 'RRULE') result.recurrenceRule = value.trim();
  }

  return result;
}

export interface MultiStatusResponse {
  href: string;
  propstat: Array<{
    prop: Record<string, string | number | boolean | null | undefined>;
    status: string;
  }>;
}

export function serializeCalDavMultiStatus(responses: MultiStatusResponse[]): string {
  const xmlLines: string[] = [
    '<?xml version="1.0" encoding="utf-8" ?>',
    '<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:CS="http://calendarserver.org/ns/">',
  ];

  for (const res of responses) {
    xmlLines.push('  <D:response>');
    xmlLines.push(`    <D:href>${escapeXml(res.href)}</D:href>`);

    for (const stat of res.propstat) {
      xmlLines.push('    <D:propstat>');
      xmlLines.push('      <D:prop>');

      for (const [key, val] of Object.entries(stat.prop)) {
        if (val === undefined) continue;

        if (key === 'resourcetype') {
          if (val === 'calendar') {
            xmlLines.push('        <D:resourcetype><D:collection/><C:calendar/></D:resourcetype>');
          } else if (val === 'collection') {
            xmlLines.push('        <D:resourcetype><D:collection/></D:resourcetype>');
          } else {
            xmlLines.push('        <D:resourcetype/>');
          }
        } else if (key === 'current-user-principal') {
          xmlLines.push(
            `        <D:current-user-principal><D:href>${escapeXml(String(val))}</D:href></D:current-user-principal>`,
          );
        } else if (key === 'calendar-home-set') {
          xmlLines.push(
            `        <C:calendar-home-set><D:href>${escapeXml(String(val))}</D:href></C:calendar-home-set>`,
          );
        } else if (key === 'calendar-user-address-set') {
          xmlLines.push(
            `        <C:calendar-user-address-set><D:href>${escapeXml(String(val))}</D:href></C:calendar-user-address-set>`,
          );
        } else if (key === 'supported-calendar-component-set') {
          xmlLines.push(
            '        <C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set>',
          );
        } else if (key === 'supported-calendar-data') {
          xmlLines.push(
            '        <C:supported-calendar-data><C:calendar-default-clip><C:comp name="VCALENDAR"/></C:calendar-default-clip></C:supported-calendar-data>',
          );
        } else if (key === 'calendar-data') {
          xmlLines.push(`        <C:calendar-data><![CDATA[${val}]]></C:calendar-data>`);
        } else if (key === 'getetag') {
          xmlLines.push(
            `        <D:getetag>"${escapeXml(String(val).replace(/^"|"$/g, ''))}"</D:getetag>`,
          );
        } else if (key === 'getctag') {
          xmlLines.push(
            `        <CS:getctag>"${escapeXml(String(val).replace(/^"|"$/g, ''))}"</CS:getctag>`,
          );
        } else if (key === 'sync-token') {
          xmlLines.push(`        <D:sync-token>${escapeXml(String(val))}</D:sync-token>`);
        } else if (key === 'displayname') {
          xmlLines.push(`        <D:displayname>${escapeXml(String(val))}</D:displayname>`);
        } else if (key === 'getcontenttype') {
          xmlLines.push(`        <D:getcontenttype>${escapeXml(String(val))}</D:getcontenttype>`);
        } else if (key === 'calendar-color') {
          xmlLines.push(`        <C:calendar-color>${escapeXml(String(val))}</C:calendar-color>`);
        } else {
          xmlLines.push(`        <D:${key}>${escapeXml(String(val))}</D:${key}>`);
        }
      }

      xmlLines.push('      </D:prop>');
      xmlLines.push(`      <D:status>${stat.status}</D:status>`);
      xmlLines.push('    </D:propstat>');
    }

    xmlLines.push('  </D:response>');
  }

  xmlLines.push('</D:multistatus>');
  return xmlLines.join('\n');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export class CalDavService {
  constructor(private readonly prisma: any) {}

  async ensurePrimaryCalendar(userId: string): Promise<CalDavCalendar> {
    let cal = await this.prisma.calendar.findFirst({
      where: { userId, isPrimary: true },
    });

    if (!cal) {
      cal = await this.prisma.calendar.create({
        data: {
          userId,
          name: 'Primary',
          color: '#fffc00',
          isPrimary: true,
        },
      });
    }

    return this.mapCalendar(cal);
  }

  async listCalendars(userId: string): Promise<CalDavCalendar[]> {
    let rows = await this.prisma.calendar.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    if (rows.length === 0) {
      const primary = await this.ensurePrimaryCalendar(userId);
      return [primary];
    }

    return rows.map((r: any) => this.mapCalendar(r));
  }

  async getCalendar(userId: string, calendarId: string): Promise<CalDavCalendar | null> {
    const row = await this.prisma.calendar.findFirst({
      where: {
        userId,
        OR: [{ id: calendarId }, { name: calendarId }],
      },
    });
    return row ? this.mapCalendar(row) : null;
  }

  async createCalendar(
    userId: string,
    calendarId: string,
    displayName?: string,
    color?: string,
  ): Promise<CalDavCalendar> {
    const existing = await this.getCalendar(userId, calendarId);
    if (existing) return existing;

    const row = await this.prisma.calendar.create({
      data: {
        id: calendarId.startsWith('cal-') ? calendarId : undefined,
        userId,
        name: displayName || calendarId,
        color: color || '#58A6FF',
        isPrimary: false,
      },
    });

    return this.mapCalendar(row);
  }

  async listEvents(
    userId: string,
    calendarId?: string,
    timeRange?: { start?: Date; end?: Date },
  ): Promise<CalDavEvent[]> {
    const where: Record<string, any> = { userId };
    if (calendarId) {
      where.calendarId = calendarId;
    }
    if (timeRange?.start || timeRange?.end) {
      where.AND = [];
      if (timeRange.start) {
        where.AND.push({ endTime: { gte: timeRange.start } });
      }
      if (timeRange.end) {
        where.AND.push({ startTime: { lte: timeRange.end } });
      }
    }

    const rows = await this.prisma.event.findMany({
      where,
      orderBy: { startTime: 'asc' },
    });

    return rows.map((r: any) => this.mapEvent(r));
  }

  async getEvent(userId: string, eventId: string): Promise<CalDavEvent | null> {
    const cleanId = eventId.replace(/\.ics$/i, '');
    const row = await this.prisma.event.findFirst({
      where: {
        userId,
        OR: [{ id: cleanId }, { id: eventId }],
      },
    });
    return row ? this.mapEvent(row) : null;
  }

  async upsertEventFromIcs(
    userId: string,
    calendarId: string,
    eventId: string,
    icsData: string,
  ): Promise<{ event: CalDavEvent; created: boolean }> {
    const parsed = parseEventIcs(icsData);
    const cleanId = (parsed.uid || eventId).replace(/\.ics$/i, '');

    const existing = await this.prisma.event.findUnique({
      where: { id: cleanId },
    });

    const now = new Date();
    const startTime = parsed.startTime || existing?.startTime || now;
    const endTime =
      parsed.endTime || existing?.endTime || new Date(startTime.getTime() + 60 * 60 * 1000);

    const title = parsed.title || existing?.title || 'Untitled Event';
    const description =
      parsed.description !== undefined ? parsed.description : existing?.description || '';
    const location = parsed.location !== undefined ? parsed.location : existing?.location || '';
    const recurrenceRule = parsed.recurrenceRule || existing?.recurrenceRule || null;

    if (existing) {
      const updated = await this.prisma.event.update({
        where: { id: cleanId },
        data: {
          calendarId,
          title,
          description,
          location,
          startTime,
          endTime,
          recurrenceRule,
          updatedAt: now,
        },
      });
      return { event: this.mapEvent(updated), created: false };
    }

    const created = await this.prisma.event.create({
      data: {
        id: cleanId,
        userId,
        calendarId,
        title,
        description,
        location,
        startTime,
        endTime,
        recurrenceRule,
        status: 'confirmed',
        createdAt: now,
        updatedAt: now,
      },
    });

    return { event: this.mapEvent(created), created: true };
  }

  async deleteEvent(userId: string, eventId: string): Promise<boolean> {
    const cleanId = eventId.replace(/\.ics$/i, '');
    const existing = await this.prisma.event.findFirst({
      where: { id: cleanId, userId },
    });
    if (!existing) return false;

    await this.prisma.event.delete({
      where: { id: cleanId },
    });
    return true;
  }

  private mapCalendar(c: any): CalDavCalendar {
    const ts = c.updatedAt instanceof Date ? c.updatedAt.getTime() : Date.now();
    return {
      id: c.id,
      userId: c.userId,
      name: c.name,
      color: c.color,
      isPrimary: Boolean(c.isPrimary),
      ctag: `ctag-${c.id}-${ts}`,
      syncToken: `sync-${c.id}-${ts}`,
    };
  }

  private mapEvent(e: any): CalDavEvent {
    const updatedAt = e.updatedAt instanceof Date ? e.updatedAt : new Date();
    const etag = `"${e.id}-${updatedAt.getTime()}"`;
    const icsData = generateEventIcs({
      id: e.id,
      title: e.title,
      description: e.description,
      location: e.location,
      startTime: e.startTime instanceof Date ? e.startTime : new Date(e.startTime),
      endTime: e.endTime instanceof Date ? e.endTime : new Date(e.endTime),
      allDay: Boolean(e.allDay),
      recurrenceRule: e.recurrenceRule,
      status: e.status,
      attendees: e.attendees,
    });

    return {
      id: e.id,
      calendarId: e.calendarId || 'primary',
      title: e.title,
      description: e.description || '',
      location: e.location || '',
      startTime: e.startTime instanceof Date ? e.startTime : new Date(e.startTime),
      endTime: e.endTime instanceof Date ? e.endTime : new Date(e.endTime),
      allDay: Boolean(e.allDay),
      recurrenceRule: e.recurrenceRule || null,
      status: e.status || 'confirmed',
      attendees: Array.isArray(e.attendees) ? e.attendees : [],
      reminders: Array.isArray(e.reminders) ? e.reminders : [],
      etag,
      icsData,
      updatedAt,
    };
  }
}
