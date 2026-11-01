import { describe, expect, it } from 'vitest';
import {
  THREAD_OVERFLOW_ITEMS,
  THREAD_CATEGORIES,
  activeSnoozedUntil,
  formatAttachmentSize,
  groupMoveFolders,
  snoozeThisEvening,
  threadCategoryLabel,
} from '../thread-overflow';

describe('thread overflow order (spec order, exact)', () => {
  it('lists the 15 spec items in order', () => {
    expect(THREAD_OVERFLOW_ITEMS.map((item) => item.id)).toEqual([
      'move',
      'move-to-other',
      'flag',
      'categorise',
      'pin',
      'snooze',
      'create-task',
      'report-junk',
      'report-phishing',
      'block',
      'ignore',
      'print',
      'light-mode',
      'reply',
      'reply-all',
    ]);
  });

  it('marks exactly the no-backend items unavailable, each with an honest note', () => {
    const unavailable = THREAD_OVERFLOW_ITEMS.filter((item) => item.kind === 'unavailable');
    expect(unavailable.map((item) => item.id)).toEqual([
      'move-to-other',
      'flag',
      'report-junk',
      'report-phishing',
      'block',
    ]);
    for (const item of unavailable) {
      expect(item.unavailableNote).toBeTruthy();
    }
  });

  it('keeps the wired items wired', () => {
    const wired = THREAD_OVERFLOW_ITEMS.filter((item) => item.kind === 'wired').map(
      (item) => item.id,
    );
    expect(wired).toEqual([
      'move',
      'categorise',
      'pin',
      'snooze',
      'create-task',
      'ignore',
      'print',
      'light-mode',
      'reply',
      'reply-all',
    ]);
  });
});

describe('snoozeThisEvening', () => {
  it('is today 19:00 when evening has not passed', () => {
    const got = snoozeThisEvening(new Date(2026, 9, 31, 10, 0, 0));
    expect(got.getHours()).toBe(19);
    expect(got.getDate()).toBe(31);
  });

  it('falls back to tomorrow 09:00 once 19:00 has passed', () => {
    const got = snoozeThisEvening(new Date(2026, 9, 31, 20, 30, 0));
    expect(got.getHours()).toBe(9);
    expect(got.getDate()).toBe(1);
  });

  it('never lands in the past', () => {
    const now = new Date(2026, 9, 31, 18, 59, 59);
    expect(snoozeThisEvening(now).getTime()).toBeGreaterThan(now.getTime());
  });
});

describe('groupMoveFolders', () => {
  const folders = [
    { id: '1', name: 'Inbox', type: 'INBOX' },
    { id: '2', name: 'Archive', type: 'ARCHIVE' },
    { id: '3', name: 'Sent', type: 'SENT' },
    { id: '4', name: 'Receipts', type: 'CUSTOM' },
  ];

  it('puts Inbox and Sent in favourites first', () => {
    const grouped = groupMoveFolders(folders, '');
    expect(grouped.favourites.map((f) => f.name)).toEqual(['Inbox', 'Sent']);
    expect(grouped.folders.map((f) => f.name)).toEqual(['Archive', 'Receipts']);
  });

  it('filters by name, case-insensitively', () => {
    const grouped = groupMoveFolders(folders, 'rec');
    expect(grouped.favourites).toEqual([]);
    expect(grouped.folders.map((f) => f.name)).toEqual(['Receipts']);
  });
});

describe('activeSnoozedUntil', () => {
  it('picks the furthest future wake time and ignores past ones', () => {
    const now = Date.parse('2026-10-31T12:00:00Z');
    const got = activeSnoozedUntil(
      [
        { snoozedUntil: new Date('2026-10-31T10:00:00Z') },
        { snoozedUntil: '2026-11-02T09:00:00Z' },
        { snoozedUntil: '2026-11-01T09:00:00Z' },
        {},
      ],
      now,
    );
    expect(got?.toISOString()).toBe('2026-11-02T09:00:00.000Z');
  });

  it('is null when nothing is snoozed', () => {
    expect(activeSnoozedUntil([{}, { snoozedUntil: null }], Date.now())).toBeNull();
  });
});

describe('formatAttachmentSize', () => {
  it('formats bytes, KB and MB', () => {
    expect(formatAttachmentSize(0)).toBe('0 KB');
    expect(formatAttachmentSize(512)).toBe('512 B');
    expect(formatAttachmentSize(112640)).toBe('110 KB');
    expect(formatAttachmentSize(2621440)).toBe('2.5 MB');
  });
});

describe('thread categories', () => {
  it('accepts exactly the backend category set', () => {
    expect([...THREAD_CATEGORIES]).toEqual([
      'primary',
      'social',
      'promotions',
      'updates',
      'forums',
    ]);
    expect(threadCategoryLabel('promotions')).toBe('Promotions');
  });
});
