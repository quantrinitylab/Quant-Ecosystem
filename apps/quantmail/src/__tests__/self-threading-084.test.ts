/**
 * QM-UIUX-084 — aggressive self-threading, regression tests.
 *
 * The hole these pin: `groupEmailsIntoThreads` grouped by counterparty, but when
 * `currentEmail` was unknown (empty/undefined) a self-send's `to:` recipient —
 * the user's own address — was read as a counterparty. Every note to self keyed
 * into one giant `with:<self>` bucket, so unrelated notes collapsed into one row
 * and a send's delivered copy could not find its Sent twin.
 *
 * The fix lives in `conversationKeyOf` (`src/lib/threading.ts`): a recipient
 * that is the sender's own address is never a counterparty on a message the user
 * sent, and a message whose sender is its own only recipient is a note-to-self
 * even when `isFromMe` cannot recognise the user.
 */
import { describe, it, expect } from 'vitest';
import { groupEmailsIntoThreads } from '../lib/threading';

const ME = 'kundan@quantmail.in';
let n = 0;
const email = (over: Record<string, unknown>) =>
  ({
    id: `s${++n}`,
    threadId: null,
    subject: '(no subject)',
    from: { email: 'x@y.z', name: 'X' },
    to: [],
    bodyText: 'body',
    receivedAt: new Date('2026-10-09T10:00:00Z'),
    isRead: true,
    ...over,
  }) as never;

const at = (iso: string) => new Date(iso);

describe('QM-UIUX-084 self-threading without a known currentEmail', () => {
  it('keeps distinct-subject self-sends in separate threads', () => {
    const mk = (subject: string, i: number) =>
      email({
        subject,
        from: { email: ME, name: 'Kundan' },
        to: [{ email: ME }],
        isSent: true,
        receivedAt: at(`2026-10-09T10:0${i}:00Z`),
      });
    const threads = groupEmailsIntoThreads([mk('Grocery list', 1), mk('Book ideas', 2)], '');

    expect(threads).toHaveLength(2);
    expect(threads.map((t) => t.subject).sort()).toEqual(['Book ideas', 'Grocery list']);
    expect(threads.every((t) => t.participantsSummary === 'You')).toBe(true);
  });

  it('folds the delivered copy of a self-send into the Sent copy', () => {
    const sent = email({
      subject: 'Trip plan',
      from: { email: ME, name: 'Kundan' },
      to: [{ email: ME }],
      isSent: true,
      receivedAt: at('2026-10-09T10:00:00Z'),
    });
    const delivered = email({
      subject: 'Trip plan',
      from: { email: ME, name: 'Kundan' },
      to: [{ email: ME }],
      isSent: false,
      receivedAt: at('2026-10-09T10:00:45Z'),
    });
    const [thread] = groupEmailsIntoThreads([sent, delivered], '');

    expect(thread.count).toBe(1);
    expect(thread.subject).toBe('Trip plan');
  });

  it('keeps distinct-subject delivered self-notes apart', () => {
    const mk = (subject: string, i: number) =>
      email({
        subject,
        from: { email: ME, name: 'Kundan' },
        to: [{ email: ME }],
        isSent: false,
        receivedAt: at(`2026-10-09T10:0${i}:00Z`),
      });
    const threads = groupEmailsIntoThreads([mk('Grocery list', 1), mk('Book ideas', 2)], '');

    expect(threads).toHaveLength(2);
  });

  it('nests a self-reply with the note it answers', () => {
    const note = email({
      subject: 'Trip plan',
      from: { email: ME, name: 'Kundan' },
      to: [{ email: ME }],
      isSent: true,
      receivedAt: at('2026-10-09T10:00:00Z'),
    });
    const reply = email({
      subject: 'Re: Trip plan',
      from: { email: ME, name: 'Kundan' },
      to: [{ email: ME }],
      isSent: true,
      receivedAt: at('2026-10-09T10:05:00Z'),
    });
    const threads = groupEmailsIntoThreads([note, reply], '');

    expect(threads).toHaveLength(1);
    expect(threads[0].count).toBe(2);
  });

  it('still threads a normal send to someone else by person', () => {
    // With a known currentEmail this is the ordinary path the fix must not move.
    const threads = groupEmailsIntoThreads(
      [
        email({
          subject: 'Hello',
          from: { email: ME, name: 'Kundan' },
          to: [{ email: 'friend@example.com', name: 'Friend' }],
          isSent: true,
        }),
        email({
          subject: 'How are you',
          from: { email: 'friend@example.com', name: 'Friend' },
          to: [{ email: ME }],
        }),
      ],
      ME,
    );

    expect(threads).toHaveLength(1);
    expect(threads[0].count).toBe(2);
  });
});
