// @vitest-environment node
/**
 * Thread detail helpers — Phase 1.4. Helper-only suite (the U3.1/U3.2/U3.3
 * precedent: the page is ~4,800 lines and cannot be mounted cheaply, so
 * the pure helpers are pinned here; component behaviour — dropdowns,
 * two-step delete, inline box, 390px overflow — is a review item, not
 * claimed by this suite).
 */
import { describe, expect, it } from 'vitest';
import {
  buildForwardBody,
  buildForwardSubject,
  buildReplySubject,
  formatAddressList,
  isOutboundMessage,
  quotedReplyPreview,
  senderDisplayName,
} from '../lib/thread-detail';
import type { Email } from '../types';

function message(overrides: Partial<Email> = {}): Email {
  return {
    id: 'm1',
    threadId: 't1',
    userId: 'u1',
    from: { email: 'jane@example.com', name: 'Jane Doe' },
    to: [],
    cc: [],
    bcc: [],
    subject: 'Hello',
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
    receivedAt: new Date('2026-10-29T10:00:00Z'),
    createdAt: new Date('2026-10-29T10:00:00Z'),
    updatedAt: new Date('2026-10-29T10:00:00Z'),
    ...overrides,
  } as Email;
}

describe('isOutboundMessage', () => {
  it('matches sent status, sent flag, address and handle', () => {
    expect(isOutboundMessage(message({ status: 'sent' }))).toBe(true);
    const flagged = message();
    (flagged as unknown as { isSent: boolean }).isSent = true;
    expect(isOutboundMessage(flagged)).toBe(true);
    expect(
      isOutboundMessage(
        message({ from: { email: 'ME@quantmail.in' } }),
        'me@quantmail.in',
      ),
    ).toBe(true);
    expect(isOutboundMessage(message())).toBe(false);
  });
});

describe('senderDisplayName', () => {
  it('reads outbound as me', () => {
    expect(
      senderDisplayName(
        message({ status: 'sent' }),
        'me@quantmail.in',
        'me',
      ),
    ).toBe('me');
    expect(
      senderDisplayName(
        message({ from: { email: 'me@quantmail.in', name: 'Me' } }),
        'me@quantmail.in',
      ),
    ).toBe('me');
    expect(
      senderDisplayName(
        message({ from: { email: 'me@quantmail.in', name: 'Me' } }),
        undefined,
        'me',
      ),
    ).toBe('me');
  });

  it('reads inbound as name, then local part, then Unknown sender', () => {
    expect(senderDisplayName(message())).toBe('Jane Doe');
    expect(
      senderDisplayName(message({ from: { email: 'jane@example.com' } })),
    ).toBe('jane');
    expect(senderDisplayName(message({ from: { email: '' } }))).toBe(
      'Unknown sender',
    );
  });
});

describe('formatAddressList', () => {
  it('uses Name <address> only when the name adds information', () => {
    expect(
      formatAddressList([
        { email: 'jane@example.com', name: 'Jane Doe' },
        { email: 'bob@example.com', name: 'bob' },
        { email: 'plain@example.com' },
      ]),
    ).toBe('Jane Doe <jane@example.com>, bob@example.com, plain@example.com');
  });

  it('returns empty string for empty input', () => {
    expect(formatAddressList([])).toBe('');
    expect(formatAddressList(undefined)).toBe('');
  });
});

describe('reply / forward subjects and bodies', () => {
  it('adds Re: / Fwd: once and keeps an existing prefix', () => {
    expect(buildReplySubject('Hello')).toBe('Re: Hello');
    expect(buildReplySubject('Re: Hello')).toBe('Re: Hello');
    expect(buildReplySubject('')).toBe('Re: (no subject)');
    expect(buildForwardSubject('Hello')).toBe('Fwd: Hello');
    expect(buildForwardSubject('Fwd: Hello')).toBe('Fwd: Hello');
    expect(buildForwardSubject(undefined)).toBe('Fwd: (no subject)');
  });

  it('emits the separator block only for a non-empty body', () => {
    expect(buildForwardBody('Original words')).toBe(
      '\n\n---------- Forwarded message ---------\nOriginal words',
    );
    expect(buildForwardBody('')).toBe('');
    expect(buildForwardBody(null)).toBe('');
  });
});

describe('quotedReplyPreview', () => {
  it('collapses whitespace, caps at 80 chars, and names an empty body', () => {
    expect(quotedReplyPreview('  hello\n\n  world  ')).toBe('hello world');
    expect(quotedReplyPreview('')).toBe('(No preview)');
    const long = quotedReplyPreview('x '.repeat(100));
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.startsWith('x x x')).toBe(true);
  });
});
