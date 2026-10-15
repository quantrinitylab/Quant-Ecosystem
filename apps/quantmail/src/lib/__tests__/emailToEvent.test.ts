// ============================================================================
// emailToEvent — fix/qm-calendar-nlp-quickadd
//
// One-key event-from-email: the draft builder pulls attendees from the
// thread's real participants, lifts a time out of the email when it names
// one, and otherwise falls back honestly (timeWasSuggested).
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  buildEventDraftFromThread,
  encodeEmailDraft,
  decodeEmailDraft,
} from '../emailToEvent';
import type { Email } from '../types';

// Wednesday 2026-10-14, 09:00 local.
const NOW = new Date(2026, 9, 14, 9, 0, 0, 0);

function email(overrides: Partial<Email> = {}): Email {
  return {
    id: 'm1',
    threadId: 't1',
    userId: 'u1',
    from: { email: 'sam@example.com', name: 'Sam' },
    to: [{ email: 'me@quantmail.in' }],
    cc: [],
    bcc: [],
    subject: 'Lunch tomorrow 1pm',
    bodyText: 'Want to grab lunch tomorrow at 1pm?',
    bodyHtml: '',
    snippet: 'Want to grab lunch tomorrow at 1pm?',
    priority: 'normal',
    category: 'primary',
    status: 'delivered',
    isRead: true,
    isStarred: false,
    isArchived: false,
    isDraft: false,
    labels: [],
    attachments: [],
    references: [],
    headers: {},
    receivedAt: new Date(2026, 9, 14, 8, 0, 0, 0),
    ...overrides,
  } as Email;
}

describe('buildEventDraftFromThread', () => {
  it('pulls attendees from the thread, minus the signed-in user', () => {
    const draft = buildEventDraftFromThread(
      [
        email({
          from: { email: 'sam@example.com' },
          to: [{ email: 'me@quantmail.in' }, { email: 'Priya@Example.com' }],
          cc: [{ email: 'sam@example.com' }, { email: 'boss@example.com' }],
        }),
        email({
          id: 'm2',
          from: { email: 'me@quantmail.in' },
          to: [{ email: 'sam@example.com' }],
          cc: [],
        }),
      ],
      'me@quantmail.in',
      NOW,
    );
    expect(draft).not.toBeNull();
    // deduped, lowercased, self excluded, cc included
    expect(draft!.attendees).toEqual(['sam@example.com', 'priya@example.com', 'boss@example.com']);
  });

  it('lifts the time out of the email when it names one', () => {
    const draft = buildEventDraftFromThread([email()], 'me@quantmail.in', NOW);
    expect(new Date(draft!.startISO).getHours()).toBe(13);
    expect(new Date(draft!.startISO).getDate()).toBe(15); // tomorrow
    expect(draft!.timeWasSuggested).toBe(false);
    expect(draft!.title).toBe('Lunch tomorrow 1pm');
  });

  it('strips Re:/Fwd: prefixes from the title', () => {
    const draft = buildEventDraftFromThread(
      [email({ subject: 'Re: Fwd: Project kickoff' })],
      'me@quantmail.in',
      NOW,
    );
    expect(draft!.title).toBe('Project kickoff');
  });

  it('falls back honestly when the email names no time', () => {
    const draft = buildEventDraftFromThread(
      [email({ subject: 'Hello', bodyText: 'just saying hi', snippet: 'just saying hi' })],
      'me@quantmail.in',
      NOW,
    );
    expect(draft!.timeWasSuggested).toBe(true);
    const start = new Date(draft!.startISO);
    expect(start.getDate()).toBe(15); // tomorrow
    expect(start.getHours()).toBe(10);
    expect(draft!.description).toContain('Suggested time');
  });

  it('links back to the real thread in the description', () => {
    const draft = buildEventDraftFromThread([email({ threadId: 'abc123' })], 'me@quantmail.in', NOW);
    expect(draft!.description).toContain('/thread/abc123');
  });

  it('returns null for an empty thread', () => {
    expect(buildEventDraftFromThread([], 'me@quantmail.in', NOW)).toBeNull();
  });

  it('builds a task draft when asked', () => {
    const draft = buildEventDraftFromThread([email()], 'me@quantmail.in', NOW, 'task');
    expect(draft!.entryType).toBe('task');
  });
});

describe('encodeEmailDraft / decodeEmailDraft', () => {
  it('round-trips a draft through the URL-safe encoding', () => {
    const draft = buildEventDraftFromThread([email()], 'me@quantmail.in', NOW)!;
    const decoded = decodeEmailDraft(encodeEmailDraft(draft));
    expect(decoded).toEqual(draft);
  });

  it('produces no URL-unsafe characters', () => {
    const draft = buildEventDraftFromThread([email()], 'me@quantmail.in', NOW)!;
    expect(encodeEmailDraft(draft)).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('returns null on damaged input instead of throwing', () => {
    expect(decodeEmailDraft('!!!not-base64!!!')).toBeNull();
    expect(decodeEmailDraft('')).toBeNull();
    expect(decodeEmailDraft(encodeEmailDraft({} as never))).toBeNull();
  });
});
