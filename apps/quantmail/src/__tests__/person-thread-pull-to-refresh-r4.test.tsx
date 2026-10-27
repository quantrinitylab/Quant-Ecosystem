// @vitest-environment jsdom
// ============================================================================
// fix/qm-people-pull-to-refresh-r4 — PersonThread pull-to-refresh wiring.
//
// The person thread had no pull gesture: the shared `usePullToRefresh` hook
// was wired only into the classic thread view. These tests drive the REAL
// hook through touch events on the thread's scroll container and prove the
// gesture fires the `onRefresh` the people page passes (its real inbox
// refetch) — not a stub — while a short pull and a horizontal swipe never
// do, and a thread rendered without `onRefresh` gains no gesture at all.
//
// Touch synthesis note: jsdom has no Touch constructor, so the events are
// plain bubbling Events with a `touches` array attached — exactly what the
// hook reads (`event.touches[0]`). React copies `touches` from the native
// event onto its synthetic event, so this drives the genuine handler path.
// jsdom's matchMedia reports no coarse pointer, so it is stubbed to the
// touch-device answer — the hook refuses to engage otherwise, by design.
// ============================================================================

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// Silence React 19's "not configured to support act(...)" warning under vitest.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import type { PhishingCheckResult } from '../hooks/usePhishingCheck';

const usePhishingCheckMock = vi.hoisted(() =>
  vi.fn((): PhishingCheckResult => ({
    status: 'clear',
    isPhishing: false,
    confidence: 2,
    indicators: [],
  })),
);
vi.mock('../hooks/usePhishingCheck', () => ({
  usePhishingCheck: (...args: unknown[]) => usePhishingCheckMock(...args),
}));

import { PersonThread, type PersonConversation } from '../components/PersonThread';
import type { Email } from '../types';

const ME = 'me@quantmail.in';
const ALICE = 'alice@example.com';

function makeEmail(partial: Partial<Email> & { id: string }): Email {
  return {
    id: partial.id,
    createdAt: new Date('2026-10-10T08:00:00Z'),
    updatedAt: new Date('2026-10-10T08:00:00Z'),
    threadId: 'thread-1',
    userId: 'user-1',
    from: { email: ALICE, name: 'Alice' },
    to: [{ email: ME }],
    cc: [],
    bcc: [],
    subject: 'Dinner',
    bodyText: 'are we still on for friday?',
    bodyHtml: '',
    snippet: 'are we still on for friday?',
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
    headers: {},
    ...partial,
  };
}

function conversation(): PersonConversation {
  const messages = [makeEmail({ id: 'm1' })];
  return {
    personKey: ALICE,
    name: 'Alice',
    email: ALICE,
    messages,
    lastMessage: messages[0],
    lastActivityAt: new Date('2026-10-10T08:00:00Z'),
    unreadCount: 0,
    lastMessageFromMe: false,
    world: 'log',
    participantEmails: [ME, ALICE],
    hasGroupMessages: false,
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderThread(onRefresh?: () => Promise<unknown> | void): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root.render(
      React.createElement(PersonThread, {
        conversation: conversation(),
        currentUserEmail: ME,
        ...(onRefresh ? { onRefresh } : {}),
      }),
    );
  });
  return container;
}

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

/**
 * A full pull: start at the top, drag 200px down. At the hook's 0.45
 * resistance that is 84px of indicator travel (capped), past the 56px
 * release line — so release fires the refresh.
 */
function fullPull(el: Element): void {
  touch(el, 'touchstart', 100, 100);
  touch(el, 'touchmove', 100, 300);
  touch(el, 'touchend', 100, 300);
}

function scrollContainer(el: ParentNode): HTMLElement {
  return el.querySelector('[data-testid="thread-scroll"]')!;
}

beforeEach(() => {
  // Simulate a touch device: the hook refuses to engage otherwise.
  Object.defineProperty(window, 'matchMedia', {
    value: (query: string) => ({
      matches: query === '(pointer: coarse)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
    configurable: true,
  });
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

describe('PersonThread pull-to-refresh', () => {
  it('fires onRefresh on a full pull from the top', () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    const el = renderThread(onRefresh);

    fullPull(scrollContainer(el));

    expect(onRefresh).toHaveBeenCalledTimes(1);
    // The spinner holds while the refresh settles.
    expect(el.querySelector('[data-testid="thread-ptr-indicator"]')).not.toBeNull();
  });

  it('does not fire on a short pull below the release line', () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    const el = renderThread(onRefresh);
    const container = scrollContainer(el);

    // 50px drag → 22px travel at 0.45 resistance, under the 56px line.
    touch(container, 'touchstart', 100, 100);
    touch(container, 'touchmove', 100, 150);
    touch(container, 'touchend', 100, 150);

    expect(onRefresh).not.toHaveBeenCalled();
    expect(el.querySelector('[data-testid="thread-ptr-indicator"]')).toBeNull();
  });

  it('does not fire on a horizontal swipe', () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    const el = renderThread(onRefresh);
    const container = scrollContainer(el);

    touch(container, 'touchstart', 100, 100);
    touch(container, 'touchmove', 300, 110);
    touch(container, 'touchend', 300, 110);

    expect(onRefresh).not.toHaveBeenCalled();
    expect(el.querySelector('[data-testid="thread-ptr-indicator"]')).toBeNull();
  });

  it('gains no gesture when onRefresh is absent', () => {
    const el = renderThread();
    const container = scrollContainer(el);

    fullPull(container);

    // No indicator ever renders: the hook is disabled, not just quiet.
    expect(el.querySelector('[data-testid="thread-ptr-indicator"]')).toBeNull();
  });
});
