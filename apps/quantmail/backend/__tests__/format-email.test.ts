import { describe, expect, it } from 'vitest';
import { formatEmailRecord } from '../lib/format-email';

/**
 * The wire contract for a message's kind.
 *
 * This is the single point where the Prisma enum (`MAIL` / `CHAT`) becomes what
 * the client reads (`mail` / `chat`), and every mailbox and thread response goes
 * through it. A regression here does not throw — it silently relabels every chat
 * message in the product as a letter — so the mapping is pinned rather than
 * trusted.
 */
describe('formatEmailRecord: messageKind', () => {
  // Typed as an open record on purpose: `formatEmailRecord` returns its argument's
  // type widened with the fields it adds, so a narrow literal type here would hide
  // the very fields under test.
  const row = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 'email-1',
    fromAddress: 'sender@example.com',
    toAddresses: ['me@quantmail.in'],
    subject: 'Design review',
    bodyPlain: 'Hello',
    ...over,
  });

  it('lowercases the stored enum', () => {
    expect(formatEmailRecord(row({ messageKind: 'CHAT' })).messageKind).toBe('chat');
    expect(formatEmailRecord(row({ messageKind: 'MAIL' })).messageKind).toBe('mail');
  });

  it('accepts a value that is already lowercase', () => {
    // A record that has been through this formatter once must survive a second
    // pass unchanged — the reply route formats what the send path returns.
    expect(formatEmailRecord(row({ messageKind: 'chat' })).messageKind).toBe('chat');
  });

  it('calls a row written before the column existed a letter', () => {
    // Migration 0052 defaults the column to `MAIL`, but a payload assembled in
    // code — an optimistic response, a fixture — can still arrive without it.
    expect(formatEmailRecord(row()).messageKind).toBe('mail');
    expect(formatEmailRecord(row({ messageKind: null })).messageKind).toBe('mail');
  });

  it('treats an unrecognized value as a letter rather than passing it through', () => {
    expect(formatEmailRecord(row({ messageKind: 'sms' })).messageKind).toBe('mail');
  });

  it('leaves the rest of the record intact', () => {
    const formatted = formatEmailRecord(row({ messageKind: 'CHAT' }));

    expect(formatted.subject).toBe('Design review');
    expect(formatted.from).toEqual({ email: 'sender@example.com', name: 'sender' });
    expect(formatted.bodyText).toBe('Hello');
  });
});
