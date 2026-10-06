import { describe, it, expect } from 'vitest';
import { matchesSearchFilters } from '../useMail';
import type { Email } from '../../types';

function makeEmail(): Email {
  return {
    id: 'e1',
    threadId: 't1',
    userId: 'u1',
    from: { email: 'kundan@quantmail.in', name: 'Kundan Singh' },
    to: [{ email: 'friend@example.com', name: 'Friend' }],
    cc: [],
    bcc: [],
    subject: 'Hello there',
    bodyText: 'hello world',
    bodyHtml: '',
    snippet: 'hello world',
    isRead: true,
    isStarred: false,
    labels: [],
    attachments: [],
    receivedAt: new Date('2026-10-05T10:00:00Z'),
    createdAt: new Date('2026-10-05T10:00:00Z'),
    updatedAt: new Date('2026-10-05T10:00:00Z'),
  } as unknown as Email;
}

function withOverrides(base: Email, overrides: Partial<Email>): Email {
  return { ...base, ...overrides } as Email;
}

describe('matchesSearchFilters', () => {
  it('matches everything when no filters are active', () => {
    const email = makeEmail();
    expect(matchesSearchFilters(email, null)).toBe(true);
    expect(matchesSearchFilters(email, {})).toBe(true);
  });

  it('matches from by address substring, case-insensitively', () => {
    const email = makeEmail();
    expect(matchesSearchFilters(email, { from: 'KUNDAN' })).toBe(true);
    expect(matchesSearchFilters(email, { from: 'quantmail.in' })).toBe(true);
    expect(matchesSearchFilters(email, { from: 'stranger' })).toBe(false);
  });

  it('matches from by sender name', () => {
    const email = makeEmail();
    expect(matchesSearchFilters(email, { from: 'singh' })).toBe(true);
  });

  it('matches to by recipient substring across to/cc/bcc', () => {
    const email = withOverrides(makeEmail(), {
      cc: [{ email: 'kundansinghrajput31980@gmail.com', name: 'Kundan Gmail' }],
    });
    expect(matchesSearchFilters(email, { to: 'kundan' })).toBe(true);
    expect(matchesSearchFilters(email, { to: 'friend@example' })).toBe(true);
    expect(matchesSearchFilters(email, { to: 'nobody-here' })).toBe(false);
  });

  it('matches subject substring', () => {
    const email = makeEmail();
    expect(matchesSearchFilters(email, { subject: 'HELLO' })).toBe(true);
    expect(matchesSearchFilters(email, { subject: 'invoice' })).toBe(false);
  });

  it('matches hasAttachment only when attachments exist', () => {
    const plain = makeEmail();
    const withFile = withOverrides(makeEmail(), {
      attachments: [{ id: 'a1', filename: 'doc.pdf' } as never],
    });
    expect(matchesSearchFilters(plain, { hasAttachment: true })).toBe(false);
    expect(matchesSearchFilters(withFile, { hasAttachment: true })).toBe(true);
    expect(matchesSearchFilters(plain, {})).toBe(true);
  });

  it('matches label by value, case-insensitively', () => {
    const email = withOverrides(makeEmail(), { labels: ['label-work-id'] });
    expect(matchesSearchFilters(email, { label: 'LABEL-WORK-ID' })).toBe(true);
    expect(matchesSearchFilters(email, { label: 'personal' })).toBe(false);
  });

  it('filters by dateFrom (inclusive, start of day)', () => {
    const email = makeEmail(); // 2026-10-05T10:00:00Z
    expect(matchesSearchFilters(email, { dateFrom: '2026-10-05' })).toBe(true);
    expect(matchesSearchFilters(email, { dateFrom: '2026-10-06' })).toBe(false);
  });

  it('filters by dateTo (inclusive, end of day)', () => {
    const email = makeEmail(); // 2026-10-05T10:00:00Z
    expect(matchesSearchFilters(email, { dateTo: '2026-10-05' })).toBe(true);
    expect(matchesSearchFilters(email, { dateTo: '2026-10-04' })).toBe(false);
  });

  it('ignores malformed dates instead of excluding everything', () => {
    const email = makeEmail();
    expect(matchesSearchFilters(email, { dateFrom: 'not-a-date' })).toBe(true);
    expect(matchesSearchFilters(email, { dateTo: 'garbage' })).toBe(true);
  });

  it('ANDs multiple filters together', () => {
    const email = makeEmail();
    expect(matchesSearchFilters(email, { from: 'kundan', subject: 'hello' })).toBe(true);
    expect(matchesSearchFilters(email, { from: 'kundan', subject: 'invoice' })).toBe(false);
    expect(
      matchesSearchFilters(email, {
        from: 'kundan',
        to: 'friend',
        dateFrom: '2026-10-01',
        dateTo: '2026-10-31',
      }),
    ).toBe(true);
  });
});
