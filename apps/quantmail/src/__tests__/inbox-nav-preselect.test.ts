import { describe, expect, it } from 'vitest';
import { findPreselectThread } from '../lib/inbox-nav';
import { groupEmailsIntoThreads } from '../lib/threading';
import type { Email } from '../types';

/**
 * x-shortcut-preselect P2: the `x` shortcut lands on the inbox with
 * `?selected=<id>`, and rows check `selectedIds.has(thread.id)` where a
 * row's id is its NEWEST message's id. The value the shortcut carries is
 * `lastMessage.threadId || lastMessage.id` (people view) or a thread-page
 * id — neither is a row id in general, so storing it raw pre-selected
 * nothing. `findPreselectThread` is the resolution the inbox effect uses:
 * these tests pin that every id shape lands on the row, and that the row's
 * id — the only value the row check accepts — is what comes back.
 */

const ME = 'kundan@quantmail.in';

let seq = 0;

/* Same minimal shape as threading.test.ts: only the fields grouping reads. */
const email = (over: Partial<Email> & { subject: string }): Email =>
  ({
    id: `e${++seq}`,
    threadId: '',
    from: { email: 'sender@example.com', name: 'Sender' },
    isRead: true,
    isStarred: false,
    labels: [],
    receivedAt: new Date('2026-01-01T09:00:00Z'),
    ...over,
  }) as unknown as Email;

const conversations = () =>
  groupEmailsIntoThreads(
    [
      email({
        id: 'a1',
        subject: 'Hii',
        threadId: 'ta',
        from: { email: 'alice@example.com', name: 'Alice' },
        to: [{ email: ME }],
        receivedAt: new Date('2026-01-01T09:00:00Z'),
      }),
      email({
        id: 'a2',
        subject: 'Re: Hii',
        threadId: 'ta',
        from: { email: 'alice@example.com', name: 'Alice' },
        to: [{ email: ME }],
        receivedAt: new Date('2026-01-01T10:00:00Z'),
      }),
      email({
        id: 'b1',
        subject: 'Deploy',
        threadId: 'tb',
        from: { email: 'bob@example.com', name: 'Bob' },
        to: [{ email: ME }],
        receivedAt: new Date('2026-01-01T11:00:00Z'),
      }),
    ],
    ME,
  );

describe('findPreselectThread (x-shortcut-preselect P2)', () => {
  it('resolves a server thread id to the row, whose id is the newest message id', () => {
    const threads = conversations();
    const alice = threads.find((t) => t.participants.includes('Alice'));
    expect(alice!.id).toBe('a2');

    const found = findPreselectThread('ta', [threads]);
    expect(found).toBe(alice);
    // The row check only accepts the row id: returning anything else
    // (e.g. the thread id itself, or the message ids) would check nothing.
    expect(found!.id).toBe('a2');
  });

  it('resolves the legacy fallback: an older message id, not just the newest', () => {
    const threads = conversations();
    const alice = threads.find((t) => t.participants.includes('Alice'));

    // The reported defect: people-view `x` falls back to lastMessage.id when
    // threadId is absent, and that id is an older message of its row. Stored
    // raw, `selectedIds.has(thread.id)` is false for every row.
    const found = findPreselectThread('a1', [threads]);
    expect(found).toBe(alice);
    expect(found!.id).toBe('a2');
  });

  it('passes a direct row id through unchanged', () => {
    const threads = conversations();
    const alice = threads.find((t) => t.participants.includes('Alice'));

    expect(findPreselectThread('a2', [threads])).toBe(alice);
  });

  it('searches later pools when the id is not in the first one', () => {
    const threads = conversations();
    const bob = threads.find((t) => t.participants.includes('Bob'));

    expect(findPreselectThread('tb', [[], threads])).toBe(bob);
    expect(findPreselectThread('b1', [[], [], threads])).toBe(bob);
  });

  it('returns null for an unknown id and for empty input, so the call site can fall back', () => {
    const threads = conversations();

    expect(findPreselectThread('not-here', [threads])).toBeNull();
    expect(findPreselectThread('', [threads])).toBeNull();
    expect(findPreselectThread(null, [threads])).toBeNull();
    expect(findPreselectThread(undefined, [threads])).toBeNull();
    expect(findPreselectThread('a1', [])).toBeNull();
    expect(findPreselectThread('a1', [undefined, null])).toBeNull();
  });
});
