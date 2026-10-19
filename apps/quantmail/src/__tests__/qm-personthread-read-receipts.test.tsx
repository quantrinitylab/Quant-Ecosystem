// @vitest-environment jsdom
// ============================================================================
// PersonThread read receipts (fix/qm-personthread-read-ticks).
//
// The default People thread rendered no delivery/read state on the viewer's
// own sent messages — WhatsApp-style ticks existed only in
// ConversationalThreadView. PersonThread now shares `receiptStatusOf` with it
// and renders EmailReadReceipt on outbound rows: single grey = sent, double
// grey = delivered, double green = read. Inbound rows, notes-to-self, and
// in-flight optimistic sends carry no ticks (each would say nothing or lie).
//
// Test convention (2026-10-13): apps/quantmail has no @testing-library/react
// and CI installs frozen, so assertions go through renderToStaticMarkup.
// ============================================================================

import { describe, it, expect } from 'vitest';
import React from 'react';

// Silence React 19's "not configured to support act(...)" warning under vitest.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// framer-motion (used by AttachmentPreview) reads matchMedia, which jsdom
// does not implement. Same test-environment shim as PersonThread.test.tsx.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
import { renderToStaticMarkup } from 'react-dom/server';
import { PersonThread, type PersonConversation } from '../components/PersonThread';
import { receiptStatusOf } from '../lib/readReceipt';
import type { Email } from '../types';

const ME = 'me@quantmail.in';
const FRIEND = 'friend@example.com';

function makeEmail(partial: Partial<Email> & { id: string }): Email {
  return {
    id: partial.id,
    createdAt: new Date('2026-10-10T08:00:00Z'),
    updatedAt: new Date('2026-10-10T08:00:00Z'),
    threadId: 'thread-1',
    userId: 'user-1',
    from: { email: FRIEND, name: 'Friend' },
    to: [{ email: ME }],
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
    receivedAt: new Date('2026-10-10T08:00:00Z'),
    ...partial,
  };
}

function makeSentEmail(over: Partial<Email> & { id: string }): Email {
  return makeEmail({
    from: { email: ME, name: 'Me' },
    to: [{ email: FRIEND, name: 'Friend' }],
    ...over,
  });
}

function makeConversation(messages: Email[]): PersonConversation {
  return {
    personKey: 'friend@example.com',
    name: 'Friend',
    email: FRIEND,
    messages,
    lastMessage: messages[messages.length - 1],
    lastActivityAt: new Date('2026-10-10T08:05:00Z'),
    unreadCount: 0,
    lastMessageFromMe: true,
    world: 'log',
    participantEmails: [ME, FRIEND],
    hasGroupMessages: false,
  };
}

/** title of the single .read-receipt span in the rendered thread, if any. */
function receiptLabelFor(messages: Email[]): string | null {
  const html = renderToStaticMarkup(
    <PersonThread conversation={makeConversation(messages)} currentUserEmail={ME} />,
  );
  const m = html.match(/class="read-receipt"[^>]*title="([^"]*)"/);
  return m ? m[1] : null;
}

describe('PersonThread read receipts (fix/qm-personthread-read-ticks)', () => {
  it('renders a Sent tick on an outbound message with no delivery stamps', () => {
    const label = receiptLabelFor([
      makeSentEmail({ id: 's1', bodyText: 'hello', receivedAt: new Date('2026-10-10T08:05:00Z') }),
    ]);
    expect(label).toBe('Sent');
  });

  it('renders a Delivered tick once deliveredAt is stamped', () => {
    const label = receiptLabelFor([
      makeSentEmail({
        id: 's2',
        bodyText: 'hello',
        deliveredAt: '2026-10-10T08:06:00Z',
        receivedAt: new Date('2026-10-10T08:05:00Z'),
      }),
    ]);
    expect(label).not.toBeNull();
    expect(label!.startsWith('Delivered')).toBe(true);
  });

  it('renders a Read tick once readAt is stamped', () => {
    const label = receiptLabelFor([
      makeSentEmail({
        id: 's3',
        bodyText: 'hello',
        deliveredAt: '2026-10-10T08:06:00Z',
        readAt: '2026-10-10T08:07:00Z',
        receivedAt: new Date('2026-10-10T08:05:00Z'),
      }),
    ]);
    expect(label).not.toBeNull();
    expect(label!.startsWith('Read')).toBe(true);
  });

  it('renders no tick on an inbound message', () => {
    const label = receiptLabelFor([
      makeEmail({ id: 'r1', bodyText: 'hi there', receivedAt: new Date('2026-10-10T08:00:00Z') }),
    ]);
    expect(label).toBeNull();
  });

  it('renders no tick on a note to self (every recipient is the viewer)', () => {
    const label = receiptLabelFor([
      makeEmail({
        id: 'self1',
        from: { email: ME, name: 'Me' },
        to: [{ email: ME }],
        bodyText: 'remember the milk',
        receivedAt: new Date('2026-10-10T08:05:00Z'),
      }),
    ]);
    expect(label).toBeNull();
  });

  it('renders no tick on an in-flight optimistic send — the Sending spinner is the state', () => {
    const pending = makeSentEmail({
      id: 'pending-xyz',
      bodyText: 'optimistic hello',
      receivedAt: new Date('2026-10-10T08:10:00Z'),
      pendingSend: true,
    } as Partial<Email> & { pendingSend?: boolean });
    const html = renderToStaticMarkup(
      <PersonThread conversation={makeConversation([pending])} currentUserEmail={ME} />,
    );
    expect(html).not.toContain('read-receipt');
    expect(html).toContain('Sending');
  });

  it('keeps the timestamp next to the tick on a sent message', () => {
    const html = renderToStaticMarkup(
      <PersonThread
        conversation={makeConversation([
          makeSentEmail({
            id: 's4',
            bodyText: 'hello',
            readAt: '2026-10-10T08:07:00Z',
            receivedAt: new Date('2026-10-10T08:05:00Z'),
          }),
        ])}
        currentUserEmail={ME}
      />,
    );
    // Same meta row: a real time string and the receipt span.
    expect(html).toContain('read-receipt');
    expect(html).toMatch(/8:05/);
  });
});

// ============================================================================
// receiptStatusOf — the shared helper both thread surfaces use.
//
// Pinned here (moved verbatim out of ConversationalThreadView) so the two
// surfaces can never drift: ticks say the same thing everywhere.
// ============================================================================

describe('receiptStatusOf (shared read-receipt helper)', () => {
  it('returns sent when neither deliveredAt nor readAt is stamped', () => {
    const receipt = receiptStatusOf(
      makeSentEmail({ id: 'u1', receivedAt: new Date('2026-10-10T08:05:00Z') }),
      true,
      ME,
    );
    expect(receipt).toEqual({ status: 'sent' });
  });

  it('returns delivered with the deliveredAt stamp', () => {
    const receipt = receiptStatusOf(
      makeSentEmail({
        id: 'u2',
        deliveredAt: '2026-10-10T08:06:00Z',
        receivedAt: new Date('2026-10-10T08:05:00Z'),
      }),
      true,
      ME,
    );
    expect(receipt).toEqual({ status: 'delivered', deliveredAt: '2026-10-10T08:06:00Z' });
  });

  it('returns read with both stamps once readAt lands', () => {
    const receipt = receiptStatusOf(
      makeSentEmail({
        id: 'u3',
        deliveredAt: '2026-10-10T08:06:00Z',
        readAt: '2026-10-10T08:07:00Z',
        receivedAt: new Date('2026-10-10T08:05:00Z'),
      }),
      true,
      ME,
    );
    expect(receipt).toEqual({
      status: 'read',
      readAt: '2026-10-10T08:07:00Z',
      deliveredAt: '2026-10-10T08:06:00Z',
    });
  });

  it('accepts Date objects for the stamps, not just ISO strings', () => {
    const receipt = receiptStatusOf(
      makeSentEmail({
        id: 'u4',
        deliveredAt: new Date('2026-10-10T08:06:00Z'),
        readAt: new Date('2026-10-10T08:07:00Z'),
        receivedAt: new Date('2026-10-10T08:05:00Z'),
      }),
      true,
      ME,
    );
    expect(receipt?.status).toBe('read');
  });

  it('returns null for inbound messages', () => {
    expect(
      receiptStatusOf(
        makeEmail({ id: 'u5', receivedAt: new Date('2026-10-10T08:00:00Z') }),
        false,
        ME,
      ),
    ).toBeNull();
  });

  it('returns null for a note to self', () => {
    expect(
      receiptStatusOf(
        makeEmail({
          id: 'u6',
          from: { email: ME, name: 'Me' },
          to: [{ email: ME }],
          receivedAt: new Date('2026-10-10T08:05:00Z'),
        }),
        true,
        ME,
      ),
    ).toBeNull();
  });

  it('still returns a status when the viewer email is unknown', () => {
    const receipt = receiptStatusOf(
      makeSentEmail({ id: 'u7', receivedAt: new Date('2026-10-10T08:05:00Z') }),
      true,
      null,
    );
    expect(receipt?.status).toBe('sent');
  });
});
