// ============================================================================
// attendeeResolve — fix/qm-calendar-nlp-quickadd-invite
//
// Name → contact-email resolution for the calendar quick-add. The search
// function is injected, so every case below runs without DOM or network.
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { resolveAttendeeEmails, type AttendeeCandidate } from '../attendeeResolve';

const CONTACTS: AttendeeCandidate[] = [
  { name: 'Alex Kumar', email: 'alex.kumar@example.com' },
  { name: 'Sam', email: 'sam@example.com' },
  { name: 'Samuel Lee', email: 'samuel@example.com' },
  { name: 'NoMail', email: '' },
];

const search = (hits: AttendeeCandidate[]) => vi.fn(async (_q: string) => hits);

describe('resolveAttendeeEmails', () => {
  it('prefers an exact name match over a fuzzy first hit', async () => {
    // "Sam" must resolve to Sam, not to Samuel Lee listed first.
    const out = await resolveAttendeeEmails(
      ['Sam'],
      search([
        { name: 'Samuel Lee', email: 'samuel@example.com' },
        { name: 'Sam', email: 'sam@example.com' },
      ]),
    );
    expect(out).toEqual([{ name: 'Sam', email: 'sam@example.com' }]);
  });

  it('falls back to the first email-shaped candidate', async () => {
    const out = await resolveAttendeeEmails(['Alex'], search([CONTACTS[0]]));
    expect(out[0].email).toBe('alex.kumar@example.com');
  });

  it('matches names case-insensitively', async () => {
    const out = await resolveAttendeeEmails(['sam'], search([{ name: 'Sam', email: 'sam@example.com' }]));
    expect(out[0].email).toBe('sam@example.com');
  });

  it('returns email null when no contact matches — never invents one', async () => {
    const out = await resolveAttendeeEmails(['Nobody'], search([]));
    expect(out).toEqual([{ name: 'Nobody', email: null }]);
  });

  it('skips candidates without an email-shaped address', async () => {
    const out = await resolveAttendeeEmails(['NoMail'], search([CONTACTS[3]]));
    expect(out[0].email).toBeNull();
  });

  it('treats a failed lookup as unresolved, not as fatal', async () => {
    const failing = vi.fn(async (_q: string): Promise<AttendeeCandidate[]> => {
      throw new Error('offline');
    });
    const out = await resolveAttendeeEmails(['Alex', 'Sam'], failing);
    expect(out).toEqual([
      { name: 'Alex', email: null },
      { name: 'Sam', email: null },
    ]);
  });

  it('resolves several names independently in order', async () => {
    const byName = (q: string) =>
      Promise.resolve(CONTACTS.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())));
    const out = await resolveAttendeeEmails(['Alex', 'Sam'], byName);
    expect(out.map((r) => r.email)).toEqual(['alex.kumar@example.com', 'sam@example.com']);
  });
});
