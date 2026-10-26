// @vitest-environment jsdom
// ============================================================================
// fix/qm-people-pull-to-refresh — PersonThread pull-to-refresh wiring.
//
// The person thread had no pull gesture at all. These tests drive the REAL
// hook through touch events on the thread's scroll container and prove the
// gesture fires the `onRefresh` the owning page supplies — and that a thread
// rendered without `onRefresh` keeps exactly its old behaviour (gesture
// disabled, no indicator, no crash).
//
// Touch synthesis note: jsdom has no Touch constructor, so the events are
// plain bubbling Events with a `touches` array attached — exactly what the
// hook reads (`event.touches[0]`). The thread renders newest-last, so the
// reader normally sits at the bottom; the hook arms only at scrollTop 0,
// which jsdom gives us (no layout), matching the oldest end where "Load
// earlier messages" lives.
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// framer-motion (used by AttachmentPreview) reads matchMedia, which jsdom
// does not implement — same shim shape as PersonThread.test.tsx, except
// the coarse-pointer query MUST match: the pull hook refuses to engage
// unless the device reports a coarse pointer, and a blanket `false` shim
// would silently disable the very gesture under test. Reduced-motion stays
// off so previews render their default markup.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('coarse'),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
import { createRoot, type Root } from 'react-dom/client';
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

function makeConversation(): PersonConversation {
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
    hasGroupMessages: false,
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

/** Drive one touch event through the real React handlers on `el`. */
function touch(el: Element, type: string, x: number, y: number): void {
  const event = new Event(type, { bubbles: true }) as Event & {
    touches: Array<{ clientX: number; clientY: number }>;
  };
  event.touches = [{ clientX: x, clientY: y }];
  act(() => {
    el.dispatchEvent(event);
  });
}

/** A full pull: start at the top, drag 200px down (past the 56px release line), release. */
function fullPull(el: Element): void {
  touch(el, 'touchstart', 100, 100);
  touch(el, 'touchmove', 100, 300);
  touch(el, 'touchend', 100, 300);
}

describe('PersonThread pull-to-refresh', () => {
  it('a full pull at the top fires onRefresh exactly once and shows the refreshing indicator', () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    const el = renderIntoDom(
      <PersonThread
        conversation={makeConversation()}
        currentUserEmail={ME}
        onRefresh={onRefresh}
      />,
    );
    const scroller = el.querySelector('[data-testid="thread-scroll"]')!;

    touch(scroller, 'touchstart', 100, 100);
    touch(scroller, 'touchmove', 100, 300);
    expect(el.querySelector('[data-testid="ptr-indicator"]')?.textContent).toContain(
      'Release to refresh',
    );

    touch(scroller, 'touchend', 100, 300);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(el.querySelector('[data-testid="ptr-indicator"]')?.textContent).toContain(
      'Refreshing conversation…',
    );
  });

  it('a short pull never fires onRefresh', () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    const el = renderIntoDom(
      <PersonThread
        conversation={makeConversation()}
        currentUserEmail={ME}
        onRefresh={onRefresh}
      />,
    );
    const scroller = el.querySelector('[data-testid="thread-scroll"]')!;

    touch(scroller, 'touchstart', 100, 100);
    touch(scroller, 'touchmove', 100, 150);
    touch(scroller, 'touchend', 100, 150);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(el.querySelector('[data-testid="ptr-indicator"]')).toBeNull();
  });

  it('without onRefresh the gesture is disabled: no indicator, no crash', () => {
    const el = renderIntoDom(
      <PersonThread conversation={makeConversation()} currentUserEmail={ME} />,
    );
    const scroller = el.querySelector('[data-testid="thread-scroll"]')!;

    fullPull(scroller);
    expect(el.querySelector('[data-testid="ptr-indicator"]')).toBeNull();
    // The thread itself still renders both directions.
    expect(el.textContent).toContain('Hey, how are you?');
    expect(el.textContent).toContain('Doing well!');
  });
});
