import { describe, it, expect } from 'vitest';
import { CalDAVServer } from '../caldav-server.js';

describe('CalDAVServer', () => {
  it('creates a calendar collection', () => {
    const server = new CalDAVServer();
    server.createCalendar({
      id: 'personal',
      displayName: 'Personal',
      ownerPrincipal: 'alice',
      color: '#FF0000',
    });

    expect(server.getCalendars()).toHaveLength(1);
    expect(server.getCalendars()[0]!.displayName).toBe('Personal');
  });

  it('handles PROPFIND to list calendars', () => {
    const server = new CalDAVServer();
    server.createCalendar({
      id: 'work',
      displayName: 'Work',
      ownerPrincipal: 'alice',
    });

    const response = server.handle({ method: 'PROPFIND', path: '/calendars/alice/' });
    expect(response.status).toBe(207);
    const body = JSON.parse(response.body);
    expect(body.multistatus.responses).toHaveLength(1);
  });

  it('handles PUT to create a new event', () => {
    const server = new CalDAVServer();
    server.createCalendar({
      id: 'personal',
      displayName: 'Personal',
      ownerPrincipal: 'alice',
    });

    const ical = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Test//Test//EN',
      'BEGIN:VEVENT',
      'UID:event-1',
      'SUMMARY:Team Meeting',
      'DTSTART:20240101T090000Z',
      'DTEND:20240101T100000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const response = server.handle({
      method: 'PUT',
      path: '/calendars/alice/personal/event-1.ics',
      body: ical,
    });

    expect(response.status).toBe(201);
    expect(server.getEvents('personal')).toHaveLength(1);
    expect(server.getEvents('personal')[0]!.summary).toBe('Team Meeting');
  });

  it('handles DELETE to remove an event', () => {
    const server = new CalDAVServer();
    server.createCalendar({
      id: 'personal',
      displayName: 'Personal',
      ownerPrincipal: 'alice',
    });

    const ical = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:event-2',
      'SUMMARY:Lunch',
      'DTSTART:20240101T120000Z',
      'DTEND:20240101T130000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    server.handle({ method: 'PUT', path: '/calendars/alice/personal/event-2.ics', body: ical });
    const delResp = server.handle({
      method: 'DELETE',
      path: '/calendars/alice/personal/event-2.ics',
    });

    expect(delResp.status).toBe(204);
    expect(server.getEvents('personal')).toHaveLength(0);
  });

  it('handles REPORT with time range filter', () => {
    const server = new CalDAVServer();
    server.createCalendar({
      id: 'cal1',
      displayName: 'Calendar',
      ownerPrincipal: 'bob',
    });

    const event1 = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:e1',
      'SUMMARY:Early',
      'DTSTART:20240101T080000Z',
      'DTEND:20240101T090000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const event2 = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:e2',
      'SUMMARY:Late',
      'DTSTART:20240201T100000Z',
      'DTEND:20240201T110000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    server.handle({ method: 'PUT', path: '/calendars/bob/cal1/e1.ics', body: event1 });
    server.handle({ method: 'PUT', path: '/calendars/bob/cal1/e2.ics', body: event2 });

    const filter = JSON.stringify({
      timeRange: { start: '20240101T000000Z', end: '20240131T235959Z' },
    });
    const response = server.handle({
      method: 'REPORT',
      path: '/calendars/bob/cal1/',
      body: filter,
    });

    expect(response.status).toBe(207);
    const body = JSON.parse(response.body);
    expect(body.multistatus.responses).toHaveLength(1);
  });

  it('returns 404 for non-existent calendar', () => {
    const server = new CalDAVServer();
    const response = server.handle({ method: 'PROPFIND', path: '/calendars/alice/nonexist/' });
    expect(response.status).toBe(404);
  });

  it('generates authentic RFC 4791 XML multistatus when Accept: application/xml is provided', () => {
    const server = new CalDAVServer();
    server.createCalendar({
      id: 'personal',
      displayName: 'Personal',
      ownerPrincipal: 'alice',
    });

    const ical = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:xml-event-1',
      'SUMMARY:Design Review',
      'DTSTART:20240101T090000Z',
      'DTEND:20240101T100000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    server.handle({
      method: 'PUT',
      path: '/calendars/alice/personal/xml-event-1.ics',
      body: ical,
    });

    // Test PROPFIND with XML header
    const propfindResp = server.handle({
      method: 'PROPFIND',
      path: '/calendars/alice/',
      headers: { accept: 'application/xml' },
    });

    expect(propfindResp.status).toBe(207);
    expect(propfindResp.headers['content-type']).toContain('application/xml');
    expect(propfindResp.body).toContain(
      '<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">',
    );
    expect(propfindResp.body).toContain('<D:displayname>Personal</D:displayname>');
    expect(propfindResp.body).toContain(
      '<D:resourcetype><D:collection/><C:calendar xmlns:C="urn:ietf:params:xml:ns:caldav"/></D:resourcetype>',
    );

    // Test REPORT with XML header
    const reportResp = server.handle({
      method: 'REPORT',
      path: '/calendars/alice/personal/',
      headers: { accept: 'application/xml' },
    });

    expect(reportResp.status).toBe(207);
    expect(reportResp.headers['content-type']).toContain('application/xml');
    expect(reportResp.body).toContain('<C:calendar-data xmlns:C="urn:ietf:params:xml:ns:caldav">');
    expect(reportResp.body).toContain('SUMMARY:Design Review');
  });
});
