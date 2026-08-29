import { describe, expect, it } from 'vitest';
import {
  groupEmailsIntoThreads,
  isAutomatedSender,
  isFromMe,
  messageKindOf,
  normalizeSubject,
  sanitizeSnippetText,
  threadFocus,
  threadKindMix,
  type ConversationThread,
} from '../lib/threading';
import type { Email } from '../types';

/**
 * These three functions decide what the inbox shows as one conversation. They
 * lived inside `app/page.tsx` and so had never been tested; two of them were
 * wrong, in ways that looked fine from the call site because the wrong answer was
 * still a plausible-looking list of rows.
 */

let seq = 0;

/**
 * A message carrying only the fields threading reads.
 *
 * The cast is deliberate. `Email` has thirty-odd fields from the API shape and
 * none of the others take part in grouping, so spelling them all out would bury
 * the one or two fields each case is actually about.
 *
 * `isSent` is named separately because the server sends it and the client `Email`
 * type does not declare it, and threading reads it in two places — `isFromMe` and
 * the send/delivery dedupe — so most cases here need to set it.
 */
const email = (over: Partial<Email> & { subject: string; isSent?: boolean }): Email =>
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

describe('sanitizeSnippetText', () => {
  it('returns an empty string for missing input', () => {
    expect(sanitizeSnippetText()).toBe('');
    expect(sanitizeSnippetText(undefined)).toBe('');
    expect(sanitizeSnippetText('')).toBe('');
  });

  it('leaves plain text alone', () => {
    expect(sanitizeSnippetText('Design review at four')).toBe('Design review at four');
  });

  it('collapses whitespace runs and trims, since the output is one line', () => {
    expect(sanitizeSnippetText('  Design   review\n\tat four  ')).toBe('Design review at four');
  });

  it('turns a non-breaking space into a plain one', () => {
    // Mail composed in Word arrives full of these; left alone they defeat the
    // whitespace collapse above and wrap in the wrong place.
    expect(sanitizeSnippetText('Design\u00A0review')).toBe('Design review');
    expect(sanitizeSnippetText('Design\u00A0\u00A0 review')).toBe('Design review');
  });

  it('repairs UTF-8 that arrived decoded as Latin-1', () => {
    expect(sanitizeSnippetText('CafÃ© at four')).toBe('Café at four');
    expect(sanitizeSnippetText('BjÃ¶rn replied')).toBe('Björn replied');
  });

  it('falls back to the replacement table when the text cannot be round-tripped', () => {
    // `decodeURIComponent(escape(...))` throws on this shape, because cp1252
    // mapped the middle byte to a character above U+00FF. The table then patches
    // the sequences that actually turn up in mail.
    expect(sanitizeSnippetText('Weâ€™re shipping')).toBe("We're shipping");
    expect(sanitizeSnippetText('shipping â€” today')).toBe('shipping — today');
  });
});

describe('normalizeSubject', () => {
  it('strips a reply prefix and lowercases what is left', () => {
    expect(normalizeSubject('Re: Design Review')).toBe('design review');
    expect(normalizeSubject('FWD: Design Review')).toBe('design review');
    expect(normalizeSubject('Fw: Design Review')).toBe('design review');
  });

  it('strips every stacked prefix, not just the first', () => {
    // A thread that has bounced between two clients arrives like this. Stopping
    // after one marker put it in its own conversation, away from the original.
    expect(normalizeSubject('Re: Fwd: Re: Design review')).toBe('design review');
    expect(normalizeSubject('RE:RE:Design review')).toBe('design review');
  });

  it("strips Outlook's counter form", () => {
    expect(normalizeSubject('Re[2]: Design review')).toBe('design review');
    expect(normalizeSubject('Re[2]: Fw: Design review')).toBe('design review');
  });

  it('returns an empty string for a subject that is nothing but prefixes', () => {
    // This is the signal `groupEmailsIntoThreads` keys off: an empty result means
    // the message carries nothing to thread on.
    expect(normalizeSubject('Re:')).toBe('');
    expect(normalizeSubject('Fwd:  ')).toBe('');
    expect(normalizeSubject('Re: Fwd:')).toBe('');
    expect(normalizeSubject('   ')).toBe('');
    expect(normalizeSubject()).toBe('');
  });

  it('repairs the subject before comparing, so mojibake still matches its clean twin', () => {
    expect(normalizeSubject('Re: CafÃ© chat')).toBe(normalizeSubject('Café chat'));
  });

  it('collapses inner whitespace so spacing cannot split a thread', () => {
    expect(normalizeSubject('Re:   Design    review')).toBe('design review');
  });
});

describe('groupEmailsIntoThreads', () => {
  it('returns an empty list for empty input', () => {
    expect(groupEmailsIntoThreads([])).toEqual([]);
    expect(groupEmailsIntoThreads()).toEqual([]);
  });

  it('puts every message with one person in a single conversation, whatever the subject', () => {
    // The model this pins is the chat list's, not the mail client's: a row is a
    // person, so two unrelated subjects to the same address are one row. The mail
    // client's answer produced the defect that prompted the change — one
    // correspondent spread across four rows of the same screen, none of which
    // could show a send next to the reply it drew.
    const threads = groupEmailsIntoThreads([
      email({ threadId: 't1', subject: 'Design review' }),
      email({ threadId: 't2', subject: 'Something else entirely' }),
    ]);

    expect(threads).toHaveLength(1);
    expect(threads[0].count).toBe(2);
  });

  it('carries the newest message threadId, which is what a reply targets', () => {
    const threads = groupEmailsIntoThreads([
      email({
        threadId: 't1',
        subject: 'Design review',
        receivedAt: new Date('2026-01-01T09:00:00Z'),
      }),
      email({
        threadId: 't2',
        subject: 'Re: Design review',
        receivedAt: new Date('2026-01-01T10:00:00Z'),
      }),
    ]);

    expect(threads).toHaveLength(1);
    expect(threads[0].threadId).toBe('t2');
  });

  it('keeps different people apart even when the subject is identical', () => {
    const threads = groupEmailsIntoThreads([
      email({
        threadId: 't1',
        subject: 'Weekly report',
        from: { email: 'alice@example.com', name: 'Alice' },
      }),
      email({
        threadId: 't1',
        subject: 'Weekly report',
        from: { email: 'bob@example.com', name: 'Bob' },
      }),
    ]);

    // Same subject, same server thread, two people: two rows. A shared `threadId`
    // does not merge them, because the key is who the conversation is with.
    expect(threads).toHaveLength(2);
  });

  it('keeps a group conversation separate from the 1:1s inside it', () => {
    const threads = groupEmailsIntoThreads(
      [
        email({
          id: 'solo',
          subject: 'Lunch',
          from: { email: 'alice@example.com', name: 'Alice' },
          to: [{ email: ME }],
        }),
        email({
          id: 'group',
          subject: 'Lunch',
          from: { email: 'alice@example.com', name: 'Alice' },
          to: [{ email: ME }, { email: 'bob@example.com', name: 'Bob' }],
        }),
      ],
      ME,
    );

    // A group of three is its own row, for the same reason a group chat is.
    expect(threads).toHaveLength(2);
    expect(threads.map((t) => t.participantsSummary).sort()).toEqual(['Alice', 'Alice, Bob']);
  });

  it('merges a reply with its parent when no threadId came back', () => {
    const threads = groupEmailsIntoThreads([
      email({ subject: 'Design review', receivedAt: new Date('2026-01-01T09:00:00Z') }),
      email({ subject: 'Re: Design review', receivedAt: new Date('2026-01-01T10:00:00Z') }),
      email({ subject: 'Re: Fwd: Design review', receivedAt: new Date('2026-01-01T11:00:00Z') }),
    ]);

    expect(threads).toHaveLength(1);
    expect(threads[0].count).toBe(3);
    expect(threads[0].normalizedSubject).toBe('design review');
  });

  it('puts what you sent and what you received in the one conversation', () => {
    // Verbatim the requirement: a message you sent to someone belongs in the same
    // place as the messages they sent you. Neither of these carries a `threadId`
    // and the subjects differ, so nothing the old model looked at could have
    // joined them.
    const threads = groupEmailsIntoThreads(
      [
        email({
          id: 'inbound',
          subject: 'Hello',
          from: { email: 'friend@example.com', name: 'Friend' },
          to: [{ email: ME }],
          receivedAt: new Date('2026-01-01T09:00:00Z'),
        }),
        email({
          id: 'outbound',
          subject: 'How are you',
          from: { email: ME, name: 'Kundan' },
          to: [{ email: 'friend@example.com', name: 'Friend' }],
          isSent: true,
          receivedAt: new Date('2026-01-02T09:00:00Z'),
        }),
      ],
      ME,
    );

    expect(threads).toHaveLength(1);
    expect(threads[0].messages.map((m) => m.id)).toEqual(['inbound', 'outbound']);
    expect(threads[0].participantsSummary).toBe('Friend');
    expect(threads[0].kindMix).toBe('mail');
  });

  it('keeps prefix-only subjects in separate conversations', () => {
    // A subject of `Re:` is truthy but normalizes to nothing. Under the old
    // subject-keyed model that sent every such message to the single key `subj:`
    // and merged unrelated mail from unrelated people into one conversation.
    // Keying on the counterparty removes the class of defect rather than the
    // instance: nothing about these three can collapse, because three people
    // cannot become one.
    const threads = groupEmailsIntoThreads([
      email({
        id: 'a',
        subject: 'Re:',
        from: { email: 'alice@example.com', name: 'Alice' },
      }),
      email({
        id: 'b',
        subject: 'Fwd:',
        from: { email: 'bob@example.com', name: 'Bob' },
      }),
      email({
        id: 'c',
        subject: '   ',
        from: { email: 'carol@example.com', name: 'Carol' },
      }),
    ]);

    expect(threads).toHaveLength(3);
    expect(threads.every((t) => t.count === 1)).toBe(true);
    expect(new Set(threads.map((t) => t.threadId)).size).toBe(3);
    expect(threads.map((t) => t.participantsSummary).sort()).toEqual(['Alice', 'Bob', 'Carol']);
  });

  it('titles a prefix-only subject as (no subject) rather than showing the bare prefix', () => {
    // `subject || '(no subject)'` let `Re:` through, so the row rendered a reply
    // marker pointing at nothing.
    const [thread] = groupEmailsIntoThreads([email({ subject: 'Re:' })]);

    expect(thread.subject).toBe('(no subject)');
    expect(thread.normalizedSubject).toBe('');
  });

  it('keeps the real subject as the title, unnormalized', () => {
    const [thread] = groupEmailsIntoThreads([email({ subject: 'Re: Design Review' })]);

    expect(thread.subject).toBe('Re: Design Review');
    expect(thread.normalizedSubject).toBe('design review');
  });

  it('reads as unread if any message someone else sent is unread, and starred if any is starred', () => {
    const [thread] = groupEmailsIntoThreads([
      email({ threadId: 't1', subject: 'Design review', isRead: true, isStarred: false }),
      email({ threadId: 't1', subject: 'Design review', isRead: false, isStarred: true }),
    ]);

    // One unread message makes the conversation unread; the star control on the
    // row toggles the whole conversation, so any star flags it.
    expect(thread.isRead).toBe(false);
    expect(thread.isStarred).toBe(true);
  });

  it('never counts a message you sent as unread', () => {
    // The Sent copy of a message is stored with `isRead: false`, so an `every`
    // over the raw flag left every conversation you had replied to permanently
    // bold. You cannot have unread mail from yourself.
    const [thread] = groupEmailsIntoThreads(
      [
        email({
          id: 'theirs',
          subject: 'Good',
          from: { email: 'friend@example.com', name: 'Friend' },
          to: [{ email: ME }],
          isRead: true,
          receivedAt: new Date('2026-01-01T09:00:00Z'),
        }),
        email({
          id: 'mine',
          subject: 'Re: Good',
          from: { email: ME, name: 'Kundan' },
          to: [{ email: 'friend@example.com', name: 'Friend' }],
          isSent: true,
          isRead: false,
          receivedAt: new Date('2026-01-01T10:00:00Z'),
        }),
      ],
      ME,
    );

    expect(thread.isRead).toBe(true);
  });

  it('collapses the Sent and delivered copies of one send into one message', () => {
    // Sending to an address that is also yours writes two rows with different
    // ids: the copy in Sent and the copy that arrived. Counting both made a
    // two-message conversation report 4, and the Sent copy's `isRead: false`
    // made it read as unread forever.
    const [thread] = groupEmailsIntoThreads(
      [
        email({
          id: 'delivered',
          threadId: 't1',
          subject: 'Re: Good',
          bodyText: 'Sounds good, thanks!',
          from: { email: ME, name: 'Kundan' },
          to: [{ email: ME }],
          inReplyTo: 'parent-1',
          isSent: false,
          isRead: true,
          receivedAt: new Date('2026-01-01T09:00:00Z'),
        }),
        email({
          id: 'sent-copy',
          threadId: 't1',
          subject: 'Re: Good',
          bodyText: 'Sounds good, thanks!',
          from: { email: ME, name: 'Kundan' },
          to: [{ email: ME }],
          inReplyTo: 'parent-1',
          isSent: true,
          isRead: false,
          isStarred: true,
          receivedAt: new Date('2026-01-01T09:00:04Z'),
        }),
      ],
      ME,
    );

    expect(thread.count).toBe(1);
    expect(thread.messages[0].id).toBe('delivered');
    // The surviving copy inherits the union of the flags, so a star on either
    // copy still flags the conversation.
    expect(thread.isStarred).toBe(true);
    expect(thread.isRead).toBe(true);
  });

  it('does not collapse two real messages that happen to look alike', () => {
    // Both of these are outgoing, so neither is the other's delivery record. A
    // person who sends the same word twice has said two things.
    const [thread] = groupEmailsIntoThreads(
      [
        email({
          id: 'first',
          subject: 'ok',
          bodyText: 'ok',
          from: { email: ME, name: 'Kundan' },
          to: [{ email: 'friend@example.com' }],
          isSent: true,
          receivedAt: new Date('2026-01-01T09:00:00Z'),
        }),
        email({
          id: 'second',
          subject: 'ok',
          bodyText: 'ok',
          from: { email: ME, name: 'Kundan' },
          to: [{ email: 'friend@example.com' }],
          isSent: true,
          receivedAt: new Date('2026-01-01T09:00:10Z'),
        }),
      ],
      ME,
    );

    expect(thread.count).toBe(2);
  });

  it('orders conversations newest first while ordering messages oldest first', () => {
    const threads = groupEmailsIntoThreads([
      email({
        id: 'old',
        subject: 'Older thread',
        from: { email: 'alice@example.com', name: 'Alice' },
        receivedAt: new Date('2026-01-01T09:00:00Z'),
      }),
      email({
        id: 'new-first',
        subject: 'Newer thread',
        from: { email: 'bob@example.com', name: 'Bob' },
        receivedAt: new Date('2026-01-02T09:00:00Z'),
      }),
      email({
        id: 'new-last',
        subject: 'Newer thread',
        from: { email: 'bob@example.com', name: 'Bob' },
        receivedAt: new Date('2026-01-03T09:00:00Z'),
      }),
    ]);

    expect(threads.map((t) => t.normalizedSubject)).toEqual(['newer thread', 'older thread']);
    expect(threads[0].messages.map((m) => m.id)).toEqual(['new-first', 'new-last']);
    expect(threads[0].latestEmail.id).toBe('new-last');
    expect(threads[0].id).toBe('new-last');
    expect(threads[0].receivedAt).toEqual(new Date('2026-01-03T09:00:00Z'));
  });

  it('falls back to createdAt when a message has no receivedAt', () => {
    const [thread] = groupEmailsIntoThreads([
      email({
        subject: 'Draft-ish',
        receivedAt: undefined,
        createdAt: new Date('2026-02-01T09:00:00Z'),
      }),
    ]);

    expect(thread.receivedAt).toEqual(new Date('2026-02-01T09:00:00Z'));
  });

  it('names the other person, not the signed-in user, when both have spoken', () => {
    const [thread] = groupEmailsIntoThreads(
      [
        email({
          threadId: 't1',
          subject: 'Design review',
          from: { email: 'alice@example.com', name: 'Alice' },
          receivedAt: new Date('2026-01-01T09:00:00Z'),
        }),
        email({
          threadId: 't1',
          subject: 'Re: Design review',
          from: { email: 'kundan@quantmail.in', name: 'Kundan' },
          to: [{ email: 'alice@example.com', name: 'Alice' }],
          receivedAt: new Date('2026-01-01T10:00:00Z'),
        }),
      ],
      'kundan@quantmail.in',
    );

    // A row is a conversation *with* someone, the way a chat list is; that you are
    // also in it is not information. Who owes the reply is `threadFocus`'s job.
    expect(thread.participants).toEqual(['Alice']);
    expect(thread.participantsSummary).toBe('Alice');
  });

  it('names the recipient of a message you sent', () => {
    // The defect this pins: reading only `from` labelled every thread you had sent
    // with your own name, so a unified inbox — where most rows are yours — showed a
    // column of "You" and no row could say who the conversation was with.
    const [thread] = groupEmailsIntoThreads(
      [
        email({
          subject: 'Invoice',
          from: { email: 'kundan@quantmail.in', name: 'Kundan' },
          to: [{ email: 'bob@example.com', name: 'Bob' }],
        }),
      ],
      'kundan@quantmail.in',
    );

    expect(thread.participantsSummary).toBe('Bob');
  });

  it('reads recipients from the flat toAddresses shape too', () => {
    // A message rehydrated from IndexedDB, or built optimistically by the composer,
    // may carry only one of the two shapes the server sends.
    const [thread] = groupEmailsIntoThreads(
      [
        {
          ...email({ subject: 'Invoice', from: { email: 'kundan@quantmail.in' }, to: undefined }),
          toAddresses: ['bob@example.com'],
        } as unknown as Email,
      ],
      'kundan@quantmail.in',
    );

    expect(thread.participantsSummary).toBe('bob');
  });

  it('counts a cc as a participant, after the direct recipients', () => {
    const [thread] = groupEmailsIntoThreads(
      [
        email({
          subject: 'Invoice',
          from: { email: 'kundan@quantmail.in' },
          to: [{ email: 'bob@example.com', name: 'Bob' }],
          cc: [{ email: 'carol@example.com', name: 'Carol' }],
        }),
      ],
      'kundan@quantmail.in',
    );

    expect(thread.participants).toEqual(['Bob', 'Carol']);
  });

  it('does not list the signed-in user among the recipients of their own message', () => {
    const [thread] = groupEmailsIntoThreads(
      [
        email({
          subject: 'Loop myself in',
          from: { email: 'kundan@quantmail.in' },
          to: [
            { email: 'kundan@quantmail.in', name: 'Kundan' },
            { email: 'bob@example.com', name: 'Bob' },
          ],
        }),
      ],
      'kundan@quantmail.in',
    );

    expect(thread.participantsSummary).toBe('Bob');
  });

  it('counts the rest once a conversation names more people than a row fits', () => {
    const [thread] = groupEmailsIntoThreads(
      [
        email({
          subject: 'Launch',
          from: { email: 'kundan@quantmail.in' },
          to: [
            { email: 'a@example.com', name: 'Alice' },
            { email: 'b@example.com', name: 'Bob' },
            { email: 'c@example.com', name: 'Carol' },
            { email: 'd@example.com', name: 'Dana' },
            { email: 'e@example.com', name: 'Erin' },
          ],
        }),
      ],
      'kundan@quantmail.in',
    );

    // Truncating the fourth name mid-word reads as a rendering fault; a count reads
    // as a group thread.
    expect(thread.participants).toHaveLength(5);
    expect(thread.participantsSummary).toBe('Alice, Bob, Carol +2');
  });

  it('recognises the user by handle across their own domains', () => {
    const [thread] = groupEmailsIntoThreads(
      [
        email({
          subject: 'Note to self',
          from: { email: 'kundan@mail.quantmail.in', name: 'Kundan' },
        }),
      ],
      'kundan@quantmail.in',
    );

    expect(thread.participants).toEqual([]);
    expect(thread.participantsSummary).toBe('You');
  });

  it('says You for a conversation with nobody else in it', () => {
    const [thread] = groupEmailsIntoThreads([email({ subject: 'Sent thing', status: 'sent' })]);

    // No signed-in address to compare against: `status: 'sent'` is enough.
    expect(thread.participantsSummary).toBe('You');
  });

  it('falls back to the local part, then to Sender, for a message with no display name', () => {
    const threads = groupEmailsIntoThreads([
      email({ subject: 'No name', from: { email: 'dana@example.com' } }),
      email({ subject: 'No sender at all', from: undefined }),
    ]);

    expect(threads.map((t) => t.participantsSummary).sort()).toEqual(['Sender', 'dana']);
  });

  it('lists each participant once however many messages they sent', () => {
    const [thread] = groupEmailsIntoThreads([
      email({
        threadId: 't1',
        subject: 'Design review',
        from: { email: 'alice@example.com', name: 'Alice' },
      }),
      email({
        threadId: 't1',
        subject: 'Design review',
        from: { email: 'alice@example.com', name: 'Alice' },
      }),
    ]);

    expect(thread.participantsSummary).toBe('Alice');
  });

  it('treats a person as one participant whichever end of a message they are on', () => {
    // The server synthesizes a recipient's display name from the local part, so the
    // same human is `Alice` when they write to you and `alice` when you write to
    // them. Keyed on the name, that listed them twice.
    const [thread] = groupEmailsIntoThreads(
      [
        email({
          threadId: 't1',
          subject: 'Design review',
          from: { email: 'kundan@quantmail.in' },
          to: [{ email: 'alice@example.com', name: 'alice' }],
          receivedAt: new Date('2026-01-01T09:00:00Z'),
        }),
        email({
          threadId: 't1',
          subject: 'Re: Design review',
          from: { email: 'alice@example.com', name: 'Alice' },
          receivedAt: new Date('2026-01-01T10:00:00Z'),
        }),
      ],
      'kundan@quantmail.in',
    );

    expect(thread.participants).toEqual(['alice']);
  });

  it('unions the labels of every message without repeating one', () => {
    const [thread] = groupEmailsIntoThreads([
      email({ threadId: 't1', subject: 'Design review', labels: ['work', 'urgent'] }),
      email({ threadId: 't1', subject: 'Design review', labels: ['urgent', 'design'] }),
    ]);

    expect([...thread.labels].sort()).toEqual(['design', 'urgent', 'work']);
  });

  it('defaults the category to primary when the message carries none', () => {
    const [thread] = groupEmailsIntoThreads([email({ subject: 'Uncategorised' })]);

    expect(thread.category).toBe('primary');
  });
});

/**
 * A thread built straight from a message list, the way the inbox builds it. Going
 * through `groupEmailsIntoThreads` rather than hand-rolling a literal keeps these
 * cases honest about the ordering `threadFocus` depends on: it reads the *last*
 * element of `messages`, and that array is sorted oldest-first.
 */
const buildThread = (messages: Email[], currentEmail?: string): ConversationThread => {
  const [built] = groupEmailsIntoThreads(messages, currentEmail);
  return built;
};

const ME = 'kundan@quantmail.in';

describe('isFromMe', () => {
  it('matches the signed-in address exactly, ignoring case and padding', () => {
    expect(
      isFromMe(email({ subject: 'Hi', from: { email: 'KUNDAN@quantmail.in' } }), ` ${ME} `),
    ).toBe(true);
  });

  it('matches a send from the same handle on another domain', () => {
    // Anyone with an alias receives on one domain and sends from another, which is
    // why a plain equality test is not enough.
    expect(isFromMe(email({ subject: 'Hi', from: { email: 'kundan@quantrinity.com' } }), ME)).toBe(
      true,
    );
  });

  it('does not match a different handle on the same domain', () => {
    expect(isFromMe(email({ subject: 'Hi', from: { email: 'arpita@quantmail.in' } }), ME)).toBe(
      false,
    );
  });

  it('does not match a handle that merely starts with mine', () => {
    expect(
      isFromMe(email({ subject: 'Hi', from: { email: 'kundansingh@quantmail.in' } }), ME),
    ).toBe(false);
  });

  it('trusts the server when it flags a message as sent', () => {
    // Mail that round-tripped through our own API carries `isSent`/`status`, and
    // the reply the user just sent is in the thread before the address on it is
    // ever compared against anything.
    expect(isFromMe({ ...email({ subject: 'Hi' }), isSent: true } as unknown as Email, ME)).toBe(
      true,
    );
    expect(isFromMe(email({ subject: 'Hi', status: 'sent' }), ME)).toBe(true);
  });

  it('reads a flat fromAddress when there is no nested from object', () => {
    expect(
      isFromMe(
        { ...email({ subject: 'Hi' }), from: undefined, fromAddress: ME } as unknown as Email,
        ME,
      ),
    ).toBe(true);
  });

  it('is false when no signed-in address is known and nothing is flagged', () => {
    expect(isFromMe(email({ subject: 'Hi' }))).toBe(false);
    expect(isFromMe(email({ subject: 'Hi' }), '')).toBe(false);
  });
});

describe('isAutomatedSender', () => {
  it.each([
    'no-reply@github.com',
    'noreply@github.com',
    'do-not-reply@bank.example',
    'notifications@linear.app',
    'alerts@datadoghq.com',
    'newsletter@stratechery.com',
    'marketing@vendor.example',
    'updates@vendor.example',
    'promo@shop.example',
    'mailer@lists.example',
    'support@vendor.example',
    'digest@substack.example',
    'bot@dependabot.example',
    'automated@ci.example',
    'notify@slack.example',
  ])('recognises %s as a machine', (address) => {
    expect(isAutomatedSender(email({ subject: 'Hi', from: { email: address } }))).toBe(true);
  });

  it('leaves a person alone', () => {
    expect(isAutomatedSender(email({ subject: 'Hi', from: { email: 'alice@example.com' } }))).toBe(
      false,
    );
  });

  it('is false when there is no address to look at, rather than guessing', () => {
    expect(
      isAutomatedSender({ ...email({ subject: 'Hi' }), from: undefined } as unknown as Email),
    ).toBe(false);
  });
});

describe('threadFocus', () => {
  it('says needs_you when a person spoke last', () => {
    const t = buildThread(
      [
        email({
          threadId: 't1',
          subject: 'Design review',
          from: { email: ME },
          to: [{ email: 'alice@example.com' }],
          receivedAt: new Date('2026-01-01T09:00:00Z'),
        }),
        email({
          threadId: 't1',
          subject: 'Re: Design review',
          from: { email: 'alice@example.com' },
          to: [{ email: ME }],
          receivedAt: new Date('2026-01-01T10:00:00Z'),
        }),
      ],
      ME,
    );

    expect(threadFocus(t, ME)).toBe('needs_you');
  });

  it('says waiting when I spoke last', () => {
    // Same two messages, opposite order. The state is a property of the last
    // message, not of who started the thread.
    const t = buildThread(
      [
        email({
          threadId: 't1',
          subject: 'Design review',
          from: { email: 'alice@example.com' },
          to: [{ email: ME }],
          receivedAt: new Date('2026-01-01T09:00:00Z'),
        }),
        email({
          threadId: 't1',
          subject: 'Re: Design review',
          from: { email: ME },
          to: [{ email: 'alice@example.com' }],
          receivedAt: new Date('2026-01-01T10:00:00Z'),
        }),
      ],
      ME,
    );

    expect(threadFocus(t, ME)).toBe('waiting');
  });

  it('says neither when a machine spoke last', () => {
    // A build notification is not a reply you owe. Keeping it out of `Needs you`
    // is the whole reason that queue can be trusted; it still shows under `All`.
    const t = buildThread(
      [email({ subject: 'Your build passed', from: { email: 'no-reply@github.com' } })],
      ME,
    );

    expect(threadFocus(t, ME)).toBe('neither');
  });

  it('falls back to latestEmail when messages is empty', () => {
    const t = buildThread([email({ subject: 'Hello', from: { email: 'alice@example.com' } })], ME);

    expect(threadFocus({ ...t, messages: [] }, ME)).toBe('needs_you');
  });

  it('says neither when there is no last message at all', () => {
    const t = buildThread([email({ subject: 'Hello' })], ME);

    expect(
      threadFocus({ ...t, messages: [], latestEmail: undefined as unknown as Email }, ME),
    ).toBe('neither');
  });

  it('treats a message the server flagged as sent as mine, whatever the address', () => {
    // Sending through an alias the client has never heard of still puts the ball
    // in the other court.
    const t = buildThread(
      [
        {
          ...email({ subject: 'Proposal', from: { email: 'k@alias.example' } }),
          isSent: true,
        } as unknown as Email,
      ],
      ME,
    );

    expect(threadFocus(t, ME)).toBe('waiting');
  });

  it('needs a signed-in address before it can call anything mine', () => {
    const t = buildThread([email({ subject: 'Hello', from: { email: 'alice@example.com' } })]);

    expect(threadFocus(t)).toBe('needs_you');
  });
});

/**
 * The mark on a message, and the mark on the conversation holding it.
 *
 * Every case below is a shape that the previous heuristic —
 * `!bodyHtml && bodyText.length < 120` — got wrong. It is worth being explicit
 * about them because each one is a real message a user can produce in one action.
 */
describe('messageKindOf', () => {
  it('reads the kind the server recorded', () => {
    expect(messageKindOf(email({ subject: 'Hi', messageKind: 'chat' }))).toBe('chat');
    expect(messageKindOf(email({ subject: 'Hi', messageKind: 'mail' }))).toBe('mail');
  });

  it('calls a message with no kind a letter', () => {
    // Everything stored before the column existed came in through a mail client or
    // the full composer, because the chat composer did not exist yet.
    expect(messageKindOf(email({ subject: 'Older mail' }))).toBe('mail');
  });

  it('is not fooled by a missing message', () => {
    expect(messageKindOf()).toBe('mail');
    expect(messageKindOf(null)).toBe('mail');
    expect(messageKindOf(undefined)).toBe('mail');
  });

  it('accepts the enum casing the database uses', () => {
    // A payload that skipped `formatEmailRecord` carries the Prisma spelling.
    expect(
      messageKindOf({ ...email({ subject: 'Hi' }), messageKind: 'CHAT' } as unknown as Email),
    ).toBe('chat');
  });

  it('ignores body shape entirely', () => {
    // A one-line letter is still a letter…
    expect(
      messageKindOf(
        email({ subject: 'Re: ok', bodyText: 'ok', bodyHtml: '', messageKind: 'mail' }),
      ),
    ).toBe('mail');
    // …and a chat message the thread view has optimistically given an HTML body is
    // still a chat message. This exact pair is what the old guess inverted.
    expect(
      messageKindOf(
        email({
          subject: 'Re: Design review',
          bodyText: 'x'.repeat(400),
          bodyHtml: '<p>x</p>',
          messageKind: 'chat',
        }),
      ),
    ).toBe('chat');
  });

  it('treats an unrecognized value as a letter rather than throwing', () => {
    expect(
      messageKindOf({ ...email({ subject: 'Hi' }), messageKind: 'sms' } as unknown as Email),
    ).toBe('mail');
  });
});

describe('threadKindMix', () => {
  it('reports the single kind when a conversation holds only one', () => {
    expect(threadKindMix([email({ subject: 'A', messageKind: 'mail' })])).toBe('mail');
    expect(threadKindMix([email({ subject: 'A', messageKind: 'chat' })])).toBe('chat');
  });

  it('reports `mixed` when a letter and a chat message share a conversation', () => {
    // The case the unified thread exists for.
    expect(
      threadKindMix([
        email({ subject: 'Design review', messageKind: 'mail' }),
        email({ subject: 'Re: Design review', messageKind: 'chat' }),
      ]),
    ).toBe('mixed');
  });

  it('reports `mixed` regardless of which kind came first', () => {
    expect(
      threadKindMix([
        email({ subject: 'Re: Design review', messageKind: 'chat' }),
        email({ subject: 'Design review', messageKind: 'mail' }),
      ]),
    ).toBe('mixed');
  });

  it('reads an empty conversation as mail, matching the single-message default', () => {
    expect(threadKindMix([])).toBe('mail');
    expect(threadKindMix()).toBe('mail');
  });

  it('counts a message with no recorded kind as a letter', () => {
    expect(
      threadKindMix([
        email({ subject: 'Old' }),
        email({ subject: 'Re: Old', messageKind: 'chat' }),
      ]),
    ).toBe('mixed');
  });
});

describe('ConversationThread.kindMix', () => {
  it('is computed for the row, so the row never walks the message list', () => {
    const t = buildThread([
      email({ subject: 'Contract', threadId: 't1', messageKind: 'mail' }),
      email({ subject: 'Re: Contract', threadId: 't1', messageKind: 'chat' }),
    ]);

    expect(t.kindMix).toBe('mixed');
    expect(t.count).toBe(2);
  });

  it('marks a conversation that is only chat as chat', () => {
    const t = buildThread([
      email({ subject: 'Standup', threadId: 't2', messageKind: 'chat' }),
      email({ subject: 'Standup', threadId: 't2', messageKind: 'chat' }),
    ]);

    expect(t.kindMix).toBe('chat');
  });

  it('marks a conversation of letters as mail', () => {
    const t = buildThread([email({ subject: 'Invoice', messageKind: 'mail' })]);

    expect(t.kindMix).toBe('mail');
  });
});
