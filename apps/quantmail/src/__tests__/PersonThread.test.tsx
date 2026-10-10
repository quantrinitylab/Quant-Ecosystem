// @vitest-environment jsdom
// ============================================================================
// People view PART 2 — PersonThread contract pins.
//
// The unified "email with chat" thread must: render both directions in
// chronological order, right-align sent / left-align received, show the
// user-locked "Naya vishay: <subject>" separator only on subject changes,
// expand/collapse long bodies, and keep the composer slot out of the Updates
// world.
// ============================================================================

import { describe, it, expect, afterEach } from 'vitest';
import React, { act } from 'react';

// Silence React 19's "not configured to support act(...)" warning under vitest.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { PersonThread, type PersonConversation } from '../components/PersonThread';
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

function makeConversation(overrides: Partial<PersonConversation> = {}): PersonConversation {
  const messages: Email[] = [
    makeEmail({ id: 'm1', bodyText: 'Hey, how are you?', receivedAt: new Date('2026-10-10T08:00:00Z') }),
    makeEmail({
      id: 'm2',
      from: { email: ME, name: 'Me' },
      to: [{ email: FRIEND, name: 'Friend' }],
      bodyText: 'Doing well!',
      receivedAt: new Date('2026-10-10T08:05:00Z'),
    }),
  ];
  return {
    personKey: 'friend@example.com',
    name: 'Friend',
    email: FRIEND,
    messages,
    lastMessage: messages[1],
    lastActivityAt: new Date('2026-10-10T08:05:00Z'),
    unreadCount: 0,
    lastMessageFromMe: true,
    world: 'log',
    participantEmails: [ME, FRIEND],
    ...overrides,
  };
}

let root: Root | null = null;
function renderIntoDom(node: React.ReactElement): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(node);
  });
  return container;
}
afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  document.body.innerHTML = '';
});

describe('PersonThread', () => {
  it('renders both directions in chronological order', () => {
    const conversation = makeConversation();
    const html = renderToStaticMarkup(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    const first = html.indexOf('Hey, how are you?');
    const second = html.indexOf('Doing well!');
    expect(first).toBeGreaterThanOrEqual(0);
    expect(second).toBeGreaterThan(first);
  });

  it('marks sent messages right-aligned and received left-aligned via data hooks', () => {
    const conversation = makeConversation();
    const container = renderIntoDom(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    const rows = Array.from(container.querySelectorAll('[data-testid="thread-message"]'));
    expect(rows).toHaveLength(2);
    // m1 received
    expect(rows[0].getAttribute('data-sent')).toBe('false');
    expect(rows[0].querySelector('.justify-start')).not.toBeNull();
    // m2 sent
    expect(rows[1].getAttribute('data-sent')).toBe('true');
    expect(rows[1].querySelector('.justify-end')).not.toBeNull();
  });

  it('shows the user-locked "Naya vishay:" separator only when the subject changes', () => {
    const conversation = makeConversation({
      messages: [
        makeEmail({ id: 'm1', subject: 'Old topic', bodyText: 'first', receivedAt: new Date('2026-10-10T08:00:00Z') }),
        makeEmail({
          id: 'm2',
          subject: 'New topic',
          from: { email: ME, name: 'Me' },
          to: [{ email: FRIEND }],
          bodyText: 'second',
          receivedAt: new Date('2026-10-10T08:05:00Z'),
        }),
        makeEmail({
          id: 'm3',
          subject: 'New topic',
          bodyText: 'third',
          receivedAt: new Date('2026-10-10T08:10:00Z'),
        }),
      ],
    });
    const container = renderIntoDom(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    const separators = Array.from(container.querySelectorAll('[data-testid="subject-change"]'));
    expect(separators).toHaveLength(1);
    expect(separators[0].textContent).toContain('Naya vishay: New topic');
  });

  it('shows no separator when the subject never changes', () => {
    const conversation = makeConversation();
    const html = renderToStaticMarkup(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    expect(html).not.toContain('Naya vishay:');
  });

  it('expands and collapses a long body with Show more / Show less', () => {
    const longBody = `start ${'x'.repeat(300)} tail-marker`;
    const conversation = makeConversation({
      messages: [makeEmail({ id: 'm1', bodyText: longBody })],
    });
    const container = renderIntoDom(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    const row = container.querySelector('[data-testid="thread-message"]')!;
    // Collapsed: snippet only, ends with ellipsis, "Show more" visible.
    expect(row.textContent).not.toContain('tail-marker');
    expect(row.textContent).toContain('…');
    const toggle = row.querySelector('button')!;
    expect(toggle.textContent).toBe('Show more');

    act(() => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(row.textContent).toContain('tail-marker');
    expect(toggle.textContent).toBe('Show less');

    act(() => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(row.textContent).not.toContain('tail-marker');
    expect(toggle.textContent).toBe('Show more');
  });

  it('does not offer a Show more toggle for short bodies', () => {
    const conversation = makeConversation();
    const container = renderIntoDom(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    expect(container.querySelector('button')).toBeNull();
  });

  it('strips HTML when only bodyHtml is present instead of injecting it', () => {
    const conversation = makeConversation({
      messages: [
        makeEmail({
          id: 'm1',
          bodyHtml: '<p>Hello <b>there</b></p><script>alert("x")</script>',
        }),
      ],
    });
    const html = renderToStaticMarkup(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    expect(html).toContain('Hello there');
    expect(html).not.toContain('<script>');
  });

  it('renders real attachment filenames and sizes, nothing invented', () => {
    const conversation = makeConversation({
      messages: [
        makeEmail({
          id: 'm1',
          bodyText: 'see attached',
          attachments: [
            {
              id: 'a1',
              createdAt: new Date(),
              updatedAt: new Date(),
              emailId: 'm1',
              filename: 'invoice.pdf',
              mimeType: 'application/pdf',
              size: 1536,
              url: 'https://example.com/invoice.pdf',
              isInline: false,
            },
          ],
        }),
      ],
    });
    const html = renderToStaticMarkup(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    expect(html).toContain('invoice.pdf');
    expect(html).toContain('1.5 KB');
  });

  it('updates world: hides the composer slot and shows the no-reply note', () => {
    const conversation = makeConversation({ world: 'updates' });
    const container = renderIntoDom(
      <PersonThread
        conversation={conversation}
        currentUserEmail={ME}
        renderComposer={<div data-testid="composer-slot">composer</div>}
      />,
    );
    expect(container.querySelector('[data-testid="composer-slot"]')).toBeNull();
    const note = container.querySelector('[data-testid="updates-no-reply-note"]');
    expect(note).not.toBeNull();
    expect(note!.textContent).toContain("Notifications don't need a reply");
  });

  it('log world: renders the composer slot when provided', () => {
    const conversation = makeConversation({ world: 'log' });
    const container = renderIntoDom(
      <PersonThread
        conversation={conversation}
        currentUserEmail={ME}
        renderComposer={<div data-testid="composer-slot">composer</div>}
      />,
    );
    expect(container.querySelector('[data-testid="composer-slot"]')).not.toBeNull();
  });

  it('groups world: shows stacked participant avatars and the real participant count', () => {
    const conversation = makeConversation({
      world: 'groups',
      name: 'Weekend plan',
      participantEmails: [ME, FRIEND, 'third@example.com'],
    });
    const container = renderIntoDom(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    const count = container.querySelector('[data-testid="thread-participant-count"]');
    expect(count).not.toBeNull();
    expect(count!.textContent).toContain('3 people');
  });
});
