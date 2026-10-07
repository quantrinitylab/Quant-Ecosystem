import { describe, it, expect } from 'vitest';
import { CalDAVSyncService } from '../sync/caldav-sync.js';
import type { CalendarEventSync } from '../sync/caldav-sync.js';

describe('CalDAVSyncService', () => {
  const credentials = { username: 'user', password: 'pass' };

  it('syncs and records last sync time', () => {
    const service = new CalDAVSyncService();

    const result = service.sync('user1', 'https://caldav.example.com', credentials);
    expect(result.lastSync).toBeDefined();
    expect(result.pushed).toBe(0);
    expect(result.pulled).toBe(0);
    expect(result.conflicts).toBe(0);
  });

  it('pushes events to the store', () => {
    const service = new CalDAVSyncService();
    const events: CalendarEventSync[] = [
      {
        uid: 'evt-1',
        summary: 'Meeting',
        dtstart: '2024-06-01T10:00:00Z',
        dtend: '2024-06-01T11:00:00Z',
        lastModified: '2024-06-01T09:00:00Z',
      },
      {
        uid: 'evt-2',
        summary: 'Lunch',
        dtstart: '2024-06-01T12:00:00Z',
        dtend: '2024-06-01T13:00:00Z',
        lastModified: '2024-06-01T09:00:00Z',
      },
    ];

    const pushed = service.push('user1', events);
    expect(pushed).toBe(2);
  });

  it('pushes updates existing events by uid', () => {
    const service = new CalDAVSyncService();
    const events: CalendarEventSync[] = [
      {
        uid: 'evt-1',
        summary: 'Original',
        dtstart: '2024-06-01T10:00:00Z',
        dtend: '2024-06-01T11:00:00Z',
        lastModified: '2024-06-01T09:00:00Z',
      },
    ];
    service.push('user1', events);

    const updated: CalendarEventSync[] = [
      {
        uid: 'evt-1',
        summary: 'Updated',
        dtstart: '2024-06-01T10:00:00Z',
        dtend: '2024-06-01T11:00:00Z',
        lastModified: '2024-06-01T10:00:00Z',
      },
    ];
    service.push('user1', updated);

    const pulled = service.pull('user1');
    expect(pulled.length).toBe(1);
    expect(pulled[0]!.summary).toBe('Updated');
  });

  it('pulls all events without since filter', () => {
    const service = new CalDAVSyncService();
    const events: CalendarEventSync[] = [
      {
        uid: 'evt-1',
        summary: 'Event 1',
        dtstart: '2024-06-01T10:00:00Z',
        dtend: '2024-06-01T11:00:00Z',
        lastModified: '2024-05-01T09:00:00Z',
      },
      {
        uid: 'evt-2',
        summary: 'Event 2',
        dtstart: '2024-06-02T10:00:00Z',
        dtend: '2024-06-02T11:00:00Z',
        lastModified: '2024-06-01T09:00:00Z',
      },
    ];
    service.push('user1', events);

    const all = service.pull('user1');
    expect(all.length).toBe(2);
  });

  it('pulls only events modified since a given date', () => {
    const service = new CalDAVSyncService();
    const events: CalendarEventSync[] = [
      {
        uid: 'evt-old',
        summary: 'Old Event',
        dtstart: '2024-06-01T10:00:00Z',
        dtend: '2024-06-01T11:00:00Z',
        lastModified: '2024-01-01T09:00:00Z',
      },
      {
        uid: 'evt-new',
        summary: 'New Event',
        dtstart: '2024-06-02T10:00:00Z',
        dtend: '2024-06-02T11:00:00Z',
        lastModified: '2024-06-01T09:00:00Z',
      },
    ];
    service.push('user1', events);

    const recent = service.pull('user1', '2024-03-01T00:00:00Z');
    expect(recent.length).toBe(1);
    expect(recent[0]!.uid).toBe('evt-new');
  });

  it('resolves conflicts with last-write-wins', () => {
    const service = new CalDAVSyncService();

    const local: CalendarEventSync[] = [
      {
        uid: 'evt-1',
        summary: 'Local Version',
        dtstart: '2024-06-01T10:00:00Z',
        dtend: '2024-06-01T11:00:00Z',
        lastModified: '2024-06-01T12:00:00Z',
      },
    ];
    const remote: CalendarEventSync[] = [
      {
        uid: 'evt-1',
        summary: 'Remote Version',
        dtstart: '2024-06-01T10:00:00Z',
        dtend: '2024-06-01T11:00:00Z',
        lastModified: '2024-06-01T10:00:00Z',
      },
    ];

    const resolutions = service.resolveConflicts(local, remote);
    expect(resolutions.length).toBe(1);
    expect(resolutions[0]!.winner).toBe('local');
    expect(resolutions[0]!.resolved.summary).toBe('Local Version');
  });

  it('resolves conflicts picking remote when newer', () => {
    const service = new CalDAVSyncService();

    const local: CalendarEventSync[] = [
      {
        uid: 'evt-1',
        summary: 'Local',
        dtstart: '2024-06-01T10:00:00Z',
        dtend: '2024-06-01T11:00:00Z',
        lastModified: '2024-06-01T08:00:00Z',
      },
    ];
    const remote: CalendarEventSync[] = [
      {
        uid: 'evt-1',
        summary: 'Remote',
        dtstart: '2024-06-01T10:00:00Z',
        dtend: '2024-06-01T11:00:00Z',
        lastModified: '2024-06-01T15:00:00Z',
      },
    ];

    const resolutions = service.resolveConflicts(local, remote);
    expect(resolutions[0]!.winner).toBe('remote');
    expect(resolutions[0]!.resolved.summary).toBe('Remote');
  });

  it('getLastSync returns null for unknown user', () => {
    const service = new CalDAVSyncService();
    expect(service.getLastSync('unknown')).toBeNull();
  });

  it('getLastSync returns token after sync', () => {
    const service = new CalDAVSyncService();
    service.sync('user1', 'https://caldav.example.com', credentials);
    expect(service.getLastSync('user1')).not.toBeNull();
  });
});
