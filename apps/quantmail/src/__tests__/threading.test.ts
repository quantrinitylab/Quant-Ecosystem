import { describe, expect, it } from 'vitest';
import { groupEmailsIntoThreads, normalizeSubject, sanitizeSnippetText } from '../lib/threading';
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
 */
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

  it('groups by threadId when the server supplied one', () => {
    const threads = groupEmailsIntoThreads([
      email({ threadId: 't1', subject: 'Design review' }),
      email({ threadId: 't1', subject: 'Something else entirely' }),
    ]);

    expect(threads).toHaveLength(1);
    expect(threads[0].count).toBe(2);
    expect(threads[0].threadId).toBe('t1');
  });

  it('keeps different threadIds apart even when the subject is identical', () => {
    const threads = groupEmailsIntoThreads([
      email({ threadId: 't1', subject: 'Weekly report' }),
      email({ threadId: 't2', subject: 'Weekly report' }),
    ]);

    expect(threads).toHaveLength(2);
  });

  it('merges a reply with its parent by subject when no threadId came back', () => {
    const threads = groupEmailsIntoThreads([
      email({ subject: 'Design review', receivedAt: new Date('2026-01-01T09:00:00Z') }),
      email({ subject: 'Re: Design review', receivedAt: new Date('2026-01-01T10:00:00Z') }),
      email({ subject: 'Re: Fwd: Design review', receivedAt: new Date('2026-01-01T11:00:00Z') }),
    ]);

    expect(threads).toHaveLength(1);
    expect(threads[0].count).toBe(3);
    expect(threads[0].normalizedSubject).toBe('design review');
  });

  it('keeps prefix-only subjects in separate conversations', () => {
    // The defect this pins: `email.subject` of `Re:` is truthy, so keying off the
    // raw string sent every such message to the single key `subj:` and merged
    // unrelated mail from unrelated people into one conversation. Nothing about
    // these two messages says they belong together.
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
    expect(threads.map((t) => t.sendersSummary).sort()).toEqual(['Alice', 'Bob', 'Carol']);
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

  it('reads as unread if any message is unread, and starred if any message is starred', () => {
    const [thread] = groupEmailsIntoThreads([
      email({ threadId: 't1', subject: 'Design review', isRead: true, isStarred: false }),
      email({ threadId: 't1', subject: 'Design review', isRead: false, isStarred: true }),
    ]);

    // One unread message makes the conversation unread; the star control on the
    // row toggles the whole conversation, so any star flags it.
    expect(thread.isRead).toBe(false);
    expect(thread.isStarred).toBe(true);
  });

  it('orders conversations newest first while ordering messages oldest first', () => {
    const threads = groupEmailsIntoThreads([
      email({ id: 'old', subject: 'Older thread', receivedAt: new Date('2026-01-01T09:00:00Z') }),
      email({
        id: 'new-first',
        threadId: 't2',
        subject: 'Newer thread',
        receivedAt: new Date('2026-01-02T09:00:00Z'),
      }),
      email({
        id: 'new-last',
        threadId: 't2',
        subject: 'Newer thread',
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

  it('names the other participants, and calls the signed-in user You', () => {
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
          receivedAt: new Date('2026-01-01T10:00:00Z'),
        }),
      ],
      'kundan@quantmail.in',
    );

    // Oldest first, so the person who started it is named first.
    expect(thread.sendersSummary).toBe('Alice, You');
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

    expect(thread.sendersSummary).toBe('You');
  });

  it('says You for a conversation with nobody else in it', () => {
    const [thread] = groupEmailsIntoThreads([email({ subject: 'Sent thing', status: 'sent' })]);

    // No signed-in address to compare against: `status: 'sent'` is enough.
    expect(thread.sendersSummary).toBe('You');
  });

  it('falls back to the local part, then to Sender, for a message with no display name', () => {
    const threads = groupEmailsIntoThreads([
      email({ subject: 'No name', from: { email: 'dana@example.com' } }),
      email({ subject: 'No sender at all', from: undefined }),
    ]);

    expect(threads.map((t) => t.sendersSummary).sort()).toEqual(['Sender', 'dana']);
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

    expect(thread.sendersSummary).toBe('Alice');
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
