import { describe, expect, it } from 'vitest';
import { groupEmailsByPerson, personSnippet } from '../lib/peopleGrouping';
import type { Email } from '../types';

/**
 * People-view grouping: one row per person.
 *
 * These pin the contract in `lib/peopleGrouping` that the sibling People-view
 * parts code against: who a message belongs to, which world it lands in, that
 * unread counts are real, and that a send and its delivered copy count once.
 */

const ME = 'me@quantmail.in';

let seq = 0;

const at = (iso: string) => new Date(iso);

/**
 * A message carrying only the fields the grouper reads. The cast is deliberate:
 * `Email` has thirty-odd fields from the API shape and spelling them all out
 * would bury the fields each case is actually about.
 *
 * `isSent` is named separately because the server sends it and the client
 * `Email` type does not declare it; the grouper reads it via `isFromMe`.
 */
const email = (over: Partial<Email> & { isSent?: boolean }): Email =>
  ({
    id: `m${++seq}`,
    threadId: `t${seq}`,
    userId: 'u1',
    from: { email: ME },
    to: [],
    cc: [],
    bcc: [],
    subject: '',
    bodyText: '',
    bodyHtml: '',
    snippet: '',
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
    receivedAt: at('2026-10-10T10:00:00Z'),
    createdAt: at('2026-10-10T10:00:00Z'),
    updatedAt: at('2026-10-10T10:00:00Z'),
    ...over,
  }) as Email;

describe('groupEmailsByPerson', () => {
  it('returns [] for empty or non-array input', () => {
    expect(groupEmailsByPerson([], ME)).toEqual([]);
    expect(groupEmailsByPerson(undefined as unknown as Email[], ME)).toEqual([]);
  });

  it('groups a 1:1 exchange into one conversation, oldest message first', () => {
    const inbound = email({
      from: { email: 'alice@example.com', name: 'Alice' },
      to: [{ email: ME }],
      subject: 'Hello',
      bodyText: 'hi there',
      snippet: 'hi there',
      isRead: false,
      receivedAt: at('2026-10-10T09:00:00Z'),
    });
    const outbound = email({
      from: { email: ME },
      to: [{ email: 'alice@example.com' }],
      subject: 'Re: Hello',
      bodyText: 'hey!',
      snippet: 'hey!',
      isSent: true,
      isRead: false,
      receivedAt: at('2026-10-10T09:05:00Z'),
    });

    const [conv] = groupEmailsByPerson([outbound, inbound], ME);

    expect(conv.personKey).toBe('alice@example.com');
    expect(conv.name).toBe('Alice');
    expect(conv.email).toBe('alice@example.com');
    expect(conv.messages).toHaveLength(2);
    expect(conv.messages[0].id).toBe(inbound.id);
    expect(conv.messages[1].id).toBe(outbound.id);
    expect(conv.lastMessage.id).toBe(outbound.id);
    expect(conv.lastMessageFromMe).toBe(true);
    expect(conv.world).toBe('log');
    expect(conv.participantEmails).toEqual(['alice@example.com']);
    expect(conv.lastActivityAt).toEqual(at('2026-10-10T09:05:00Z'));
  });

  it('counts only real unreads: inbound unread counts, my own sends never do', () => {
    const unreadInbound = email({
      from: { email: 'alice@example.com' },
      to: [{ email: ME }],
      isRead: false,
      receivedAt: at('2026-10-10T09:00:00Z'),
    });
    const readInbound = email({
      from: { email: 'alice@example.com' },
      to: [{ email: ME }],
      isRead: true,
      receivedAt: at('2026-10-10T09:01:00Z'),
    });
    const myUnreadSend = email({
      from: { email: ME },
      to: [{ email: 'alice@example.com' }],
      isSent: true,
      isRead: false,
      receivedAt: at('2026-10-10T09:02:00Z'),
    });

    const [conv] = groupEmailsByPerson([unreadInbound, readInbound, myUnreadSend], ME);
    expect(conv.unreadCount).toBe(1);
  });

  it('keys a note to self as self, named You, with no participants', () => {
    const note = email({
      from: { email: ME },
      to: [{ email: ME }],
      subject: 'Reminder',
      snippet: 'buy milk',
      isSent: true,
      isRead: false,
      receivedAt: at('2026-10-10T08:00:00Z'),
    });

    const [conv] = groupEmailsByPerson([note], ME);
    expect(conv.personKey).toBe('self');
    expect(conv.name).toBe('You');
    expect(conv.email).toBe(ME);
    expect(conv.world).toBe('log');
    expect(conv.participantEmails).toEqual([]);
    expect(conv.unreadCount).toBe(0);
  });

  it('keys a group message by its primary other party and marks the world groups', () => {
    const group = email({
      from: { email: ME },
      to: [{ email: 'alice@example.com' }, { email: 'bob@example.com', name: 'Bob' }],
      subject: 'Team',
      snippet: 'hi all',
      isSent: true,
      receivedAt: at('2026-10-10T09:30:00Z'),
    });

    const [conv] = groupEmailsByPerson([group], ME);
    expect(conv.personKey).toBe('alice@example.com');
    expect(conv.world).toBe('groups');
    expect(conv.participantEmails).toEqual(['alice@example.com', 'bob@example.com']);
    // No name attached to alice's address anywhere: falls back to the handle.
    expect(conv.name).toBe('alice');
  });

  it('P1-E: one group mail does not hijack the 1:1 row into Groups', () => {
    const direct1 = email({
      from: { email: 'alice@example.com', name: 'Alice' },
      to: [{ email: ME }],
      subject: 'Hi',
      snippet: 'hello',
      isRead: false,
      receivedAt: at('2026-10-10T08:00:00Z'),
    });
    const direct2 = email({
      from: { email: ME },
      to: [{ email: 'alice@example.com' }],
      subject: 'Re: Hi',
      snippet: 'hey back',
      isSent: true,
      receivedAt: at('2026-10-10T08:30:00Z'),
    });
    const group = email({
      from: { email: ME },
      to: [{ email: 'alice@example.com' }, { email: 'bob@example.com' }],
      subject: 'Team',
      snippet: 'hi all',
      isSent: true,
      receivedAt: at('2026-10-10T09:00:00Z'),
    });

    const [conv] = groupEmailsByPerson([direct1, direct2, group], ME);
    // The row stays in Log: the 1:1 history is not evicted by one group mail.
    expect(conv.world).toBe('log');
    expect(conv.hasGroupMessages).toBe(true);
    // All three messages remain in the one person row.
    expect(conv.messages).toHaveLength(3);
    expect(conv.participantEmails).toEqual(['alice@example.com', 'bob@example.com']);
  });

  it('P1-E: a purely 1:1 bucket has hasGroupMessages false', () => {
    const direct = email({
      from: { email: 'alice@example.com', name: 'Alice' },
      to: [{ email: ME }],
      subject: 'Hi',
      snippet: 'hello',
      receivedAt: at('2026-10-10T08:00:00Z'),
    });
    const [conv] = groupEmailsByPerson([direct], ME);
    expect(conv.world).toBe('log');
    expect(conv.hasGroupMessages).toBe(false);
  });

  it('classifies a declared promotions category as updates', () => {
    const promo = email({
      from: { email: 'deals@store.com', name: 'Store' },
      to: [{ email: ME }],
      category: 'promotions',
      subject: 'Sale',
      snippet: '50% off',
      isRead: false,
      receivedAt: at('2026-10-10T07:00:00Z'),
    });

    const [conv] = groupEmailsByPerson([promo], ME);
    expect(conv.world).toBe('updates');
    expect(conv.personKey).toBe('deals@store.com');
  });

  it('classifies a noreply sender as updates even with a primary category', () => {
    const notice = email({
      from: { email: 'noreply@bank.com' },
      to: [{ email: ME }],
      category: 'primary',
      subject: 'Statement ready',
      snippet: 'your statement',
      isRead: false,
      receivedAt: at('2026-10-10T07:00:00Z'),
    });

    const [conv] = groupEmailsByPerson([notice], ME);
    expect(conv.world).toBe('updates');
  });

  it('sorts conversations newest first', () => {
    const older = email({
      from: { email: 'alice@example.com' },
      to: [{ email: ME }],
      receivedAt: at('2026-10-10T08:00:00Z'),
    });
    const newer = email({
      from: { email: 'bob@example.com' },
      to: [{ email: ME }],
      receivedAt: at('2026-10-10T09:00:00Z'),
    });

    const convs = groupEmailsByPerson([older, newer], ME);
    expect(convs.map((c) => c.personKey)).toEqual(['bob@example.com', 'alice@example.com']);
  });

  it('collapses a send and its delivered copy into one message', () => {
    const sentAt = at('2026-10-10T10:00:00Z');
    const sent = email({
      from: { email: ME },
      to: [{ email: 'alice@example.com' }],
      subject: 'Hi',
      bodyText: 'hello',
      snippet: 'hello',
      isSent: true,
      isRead: false,
      receivedAt: sentAt,
    });
    const delivered = email({
      from: { email: ME },
      to: [{ email: 'alice@example.com' }],
      subject: 'Hi',
      bodyText: 'hello',
      snippet: 'hello',
      isRead: true,
      receivedAt: at('2026-10-10T10:00:01Z'),
    });

    const [conv] = groupEmailsByPerson([sent, delivered], ME);
    expect(conv.messages).toHaveLength(1);
    // The survivor inherits the union of the flags: read because one copy was.
    expect(conv.messages[0].isRead).toBe(true);
    expect(conv.messages[0].collapsedIds).toContain(delivered.id);
  });

  it('excludes drafts from grouping', () => {
    const draft = email({
      from: { email: ME },
      to: [{ email: 'alice@example.com' }],
      subject: 'Draft',
      snippet: 'not sent yet',
      isDraft: true,
      status: 'draft',
      receivedAt: at('2026-10-10T09:00:00Z'),
    });
    const real = email({
      from: { email: 'alice@example.com' },
      to: [{ email: ME }],
      subject: 'Hello',
      snippet: 'hi',
      isRead: false,
      receivedAt: at('2026-10-10T09:01:00Z'),
    });

    const [conv] = groupEmailsByPerson([draft, real], ME);
    expect(conv.messages).toHaveLength(1);
    expect(conv.messages[0].id).toBe(real.id);
  });

  it('prefers the name the person signs with, then recipient names, then the handle', () => {
    const signed = email({
      from: { email: 'carol@example.com', name: 'Carol D' },
      to: [{ email: ME }],
      receivedAt: at('2026-10-10T09:00:00Z'),
    });
    const [c1] = groupEmailsByPerson([signed], ME);
    expect(c1.name).toBe('Carol D');

    const namedRecipient = email({
      from: { email: ME },
      to: [{ email: 'dave@example.com', name: 'Dave' }],
      isSent: true,
      receivedAt: at('2026-10-10T09:00:00Z'),
    });
    const [c2] = groupEmailsByPerson([namedRecipient], ME);
    expect(c2.name).toBe('Dave');
  });
});

describe('personSnippet', () => {
  const convWith = (last: Partial<Email> & { isSent?: boolean }, fromMe: boolean) => {
    const lastMessage = email({
      from: fromMe ? { email: ME } : { email: 'alice@example.com', name: 'Alice' },
      to: fromMe ? [{ email: 'alice@example.com' }] : [{ email: ME }],
      ...(fromMe ? { isSent: true } : {}),
      ...last,
    });
    const [conv] = groupEmailsByPerson([lastMessage], ME);
    return conv;
  };

  it('prefixes "You: " when the last message is mine', () => {
    const conv = convWith({ snippet: 'on my way' }, true);
    expect(personSnippet(conv)).toBe('You: on my way');
  });

  it('shows the bare snippet when the last message is theirs', () => {
    const conv = convWith({ snippet: 'see you soon' }, false);
    expect(personSnippet(conv)).toBe('see you soon');
  });

  it('trims the snippet to ~80 characters', () => {
    const conv = convWith({ snippet: 'x'.repeat(100) }, false);
    expect(personSnippet(conv)).toHaveLength(80);
  });

  it('repairs markup in the snippet instead of printing it', () => {
    const conv = convWith({ snippet: '**bold** and `code` here' }, false);
    expect(personSnippet(conv)).toBe('bold and code here');
  });
});
