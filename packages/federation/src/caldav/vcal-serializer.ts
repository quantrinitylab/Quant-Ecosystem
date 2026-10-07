import { z } from 'zod';

export const CalendarEventSchema = z.object({
  uid: z.string(),
  summary: z.string(),
  dtstart: z.string(),
  dtend: z.string(),
  description: z.string().optional(),
  location: z.string().optional(),
  organizer: z.string().optional(),
  attendees: z.array(z.string()).optional(),
  rrule: z.string().optional(),
  status: z.enum(['TENTATIVE', 'CONFIRMED', 'CANCELLED']).optional(),
  created: z.string().optional(),
  lastModified: z.string().optional(),
});

export type CalendarEvent = z.infer<typeof CalendarEventSchema>;

export class VCalSerializer {
  serialize(event: CalendarEvent): string {
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Quant//Federation//EN',
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `SUMMARY:${this.escapeValue(event.summary)}`,
      `DTSTART:${event.dtstart}`,
      `DTEND:${event.dtend}`,
    ];

    if (event.description) {
      lines.push(`DESCRIPTION:${this.escapeValue(event.description)}`);
    }
    if (event.location) {
      lines.push(`LOCATION:${this.escapeValue(event.location)}`);
    }
    if (event.organizer) {
      lines.push(`ORGANIZER:mailto:${event.organizer}`);
    }
    if (event.attendees) {
      for (const attendee of event.attendees) {
        lines.push(`ATTENDEE:mailto:${attendee}`);
      }
    }
    if (event.rrule) {
      lines.push(`RRULE:${event.rrule}`);
    }
    if (event.status) {
      lines.push(`STATUS:${event.status}`);
    }
    if (event.created) {
      lines.push(`CREATED:${event.created}`);
    }
    if (event.lastModified) {
      lines.push(`LAST-MODIFIED:${event.lastModified}`);
    }

    lines.push('END:VEVENT', 'END:VCALENDAR');
    return lines.join('\r\n');
  }

  parse(ical: string): CalendarEvent | null {
    const lines = ical.replace(/\r\n /g, '').split(/\r?\n/);
    const props: Record<string, string> = {};
    const attendees: string[] = [];
    let inEvent = false;

    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') {
        inEvent = true;
        continue;
      }
      if (line === 'END:VEVENT') {
        inEvent = false;
        continue;
      }
      if (!inEvent) continue;

      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const key = line.slice(0, colonIdx).split(';')[0]!;
      const value = line.slice(colonIdx + 1);

      if (key === 'ATTENDEE') {
        attendees.push(value.replace('mailto:', ''));
      } else if (key === 'ORGANIZER') {
        props['organizer'] = value.replace('mailto:', '');
      } else {
        props[key] = value;
      }
    }

    if (!props['UID'] || !props['SUMMARY'] || !props['DTSTART'] || !props['DTEND']) {
      return null;
    }

    const event: CalendarEvent = {
      uid: props['UID'],
      summary: this.unescapeValue(props['SUMMARY']),
      dtstart: props['DTSTART'],
      dtend: props['DTEND'],
    };

    if (props['DESCRIPTION']) event.description = this.unescapeValue(props['DESCRIPTION']);
    if (props['LOCATION']) event.location = this.unescapeValue(props['LOCATION']);
    if (props['organizer']) event.organizer = props['organizer'];
    if (attendees.length > 0) event.attendees = attendees;
    if (props['RRULE']) event.rrule = props['RRULE'];
    if (props['STATUS']) event.status = props['STATUS'] as CalendarEvent['status'];
    if (props['CREATED']) event.created = props['CREATED'];
    if (props['LAST-MODIFIED']) event.lastModified = props['LAST-MODIFIED'];

    return event;
  }

  private escapeValue(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
  }

  private unescapeValue(value: string): string {
    return value
      .replace(/\\n/g, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
  }
}
