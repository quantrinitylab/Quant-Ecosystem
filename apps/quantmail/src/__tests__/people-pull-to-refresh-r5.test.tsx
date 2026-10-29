// @vitest-environment jsdom
// ============================================================================
// fix/qm-people-pull-to-refresh-r5 — pull-to-refresh on the People surfaces.
//
// R5 CONTEXT (read before touching this suite): r1–r4 dispatched this same
// finding; r4 (PR #1709) went CI-red 3 consecutive runs, but diagnosis of
// its check logs showed NONE of the reds came from its code:
//   - gate + Dependency audit: pre-existing repo-wide dependency
//     vulnerabilities (vite/next/dompurify/zod/body-parser/undici/fast-uri)
//     that fail identically on origin/main's head commit.
//   - quantmail-e2e: infra failure — "Playwright does not support chromium
//     on ubuntu26.04-x64" — also failing on main.
//   - full-sweep: exactly ONE test failed out of 2141, and it was the
//     UNRELATED calendar world-clock test expecting 'UTC+1' for London
//     after UK DST ended (2026-10-25) flipped London to UTC+0.
//   - QuantMail typecheck + build: SUCCESS on r4.
// So r5 re-implements the same proven approach fresh off origin/main — the
// shared usePullToRefresh hook wired into PeopleHome + PersonThread with
// the page's real useInbox refetch — and this suite pins the behaviour
// through the genuine render path (real hook, real components, only the
// network/shell layers mocked). No @testing-library/react anywhere (it is
// not a quantmail dependency; CI's frozen install would fail on it).
//
// What is proved:
//   People home: a pull past the 56px release line fires the real refetch
//     exactly once; a short pull does not; a pull on the ERROR state (where
//     the finding noted only a Retry button existed) still refreshes.
//   Person thread: the same gesture fires the page's onRefresh exactly
//     once; without onRefresh the gesture is dead (no indicator, no crash);
//     a reader scrolled mid-thread never triggers it.
// ============================================================================

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Email } from '../types';
import type { PersonConversation } from '../lib/peopleGrouping';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The pull hook arms only on a coarse pointer (touch device). jsdom has no
// matchMedia; the shim reports coarse for the pointer query and false for
// everything else (framer-motion's reduced-motion check included).
if (typeof window !== 'undefined') {
  window.matchMedia = ((query: string) => ({
    matches: query === '(pointer: coarse)',
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const ME = 'me@quantmail.in';
const FRIEND = 'friend@example.com';

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  lens: null as string | null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push }),
  useParams: () => ({}),
  useSearchParams: () => ({
    get: (key: string) => (key === 'lens' ? nav.lens : null),
  }),
}));

vi.mock('../providers/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'u1', email: ME } }),
}));

const useInboxMock = vi.hoisted(() => vi.fn());
vi.mock('../hooks/useInbox', () => ({ useInbox: useInboxMock }));

const mutationsMock = vi.hoisted(() => ({
  archive: vi.fn(),
  unarchive: vi.fn(),
  trash: vi.fn(),
  toggleStar: vi.fn(),
  markRead: vi.fn(),
  markUnread: vi.fn(),
}));
vi.mock('../hooks/useMailMutations', () => ({
  useMailMutations: () => mutationsMock,
}));

vi.mock('../components/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../components/AppSidebar', () => ({
  AppSidebar: () => null,
}));

vi.mock('../components/PeopleWorldTabs', () => ({
  PeopleWorldTabs: () => null,
}));

vi.mock('../components/MailboxViewToggle', () => ({
  MailboxViewToggle: () => null,
}));

vi.mock('@quant/shared-ui', () => ({
  Skeleton: () => null,
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

// PeopleHome mounts PeopleDueReminders, which reads GET
// /follow-up-reminders on mount. Keep the endpoint empty: these tests are
// about the pull gesture, not reminder delivery.
vi.mock('../services/api-client', () => ({
  apiClient: {
    listFollowUpReminders: () => Promise.resolve({ success: true, data: [] }),
    dismissFollowUpReminder: () =>
      Promise.resolve({ success: true, data: { message: 'Reminder dismissed' } }),
  },
}));

import { PeopleHome } from '../components/PeopleHome';
import { PersonThread } from '../components/PersonThread';

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
    personKey: FRIEND,
    email: FRIEND,
    name: 'Friend',
    world: 'log',
    messages,
    lastMessage: messages[1],
    unreadCount: 0,
  } as PersonConversation;
}

/** Dispatch a React-visible touch event carrying one touch point. */
function touch(el: HTMLElement, type: string, x: number, y: number): void {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(ev, 'touches', { value: [{ clientX: x, clientY: y }] });
  act(() => {
    el.dispatchEvent(ev);
  });
}

/** A downward pull from (50,100) to (50,100+pull) on a container at top. */
function pull(el: HTMLElement, pullPx: number): void {
  touch(el, 'touchstart', 50, 100);
  touch(el, 'touchmove', 50, 100 + pullPx);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(node: React.ReactNode): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(node);
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  if (container) container.remove();
  container = null;
  vi.clearAllMocks();
});

function inboxState(overrides: Record<string, unknown> = {}) {
  return {
    data: [makeEmail({ id: 'm1', bodyText: 'Hey', receivedAt: new Date('2026-10-10T08:00:00Z') })],
    isLoading: false,
    isError: false,
    refetch: vi.fn(() => Promise.resolve()),
    loadMore: vi.fn(),
    hasMore: false,
    isLoadingMore: false,
    ...overrides,
  };
}

describe('People home pull-to-refresh (r5)', () => {
  beforeEach(() => {
    useInboxMock.mockImplementation(() => inboxState());
  });

  it('fires the real refetch exactly once when pulled past the release line', async () => {
    const refetch = vi.fn(() => Promise.resolve());
    useInboxMock.mockImplementation(() => inboxState({ refetch }));
    render(<PeopleHome />);
    const scroll = container!.querySelector('[data-testid="people-scroll"]') as HTMLElement;
    expect(scroll).not.toBeNull();
    pull(scroll, 200); // 200 * 0.45 resistance = 90 > 56 release line
    expect(container!.querySelector('[data-testid="people-ptr-indicator"]')).not.toBeNull();
    touch(scroll, 'touchend', 50, 300);
    expect(refetch).toHaveBeenCalledTimes(1);
    // Spinner holds while the refetch settles (min 450ms), then folds.
    expect(container!.querySelector('[data-testid="people-ptr-indicator"]')).not.toBeNull();
    await act(async () => {
      await sleep(700);
    });
    expect(container!.querySelector('[data-testid="people-ptr-indicator"]')).toBeNull();
  });

  it('does not refresh on a short pull below the release line', () => {
    const refetch = vi.fn(() => Promise.resolve());
    useInboxMock.mockImplementation(() => inboxState({ refetch }));
    render(<PeopleHome />);
    const scroll = container!.querySelector('[data-testid="people-scroll"]') as HTMLElement;
    pull(scroll, 80); // 80 * 0.45 = 36 < 56: indicator shows, no fire
    expect(container!.querySelector('[data-testid="people-ptr-indicator"]')).not.toBeNull();
    touch(scroll, 'touchend', 50, 180);
    expect(refetch).not.toHaveBeenCalled();
    expect(container!.querySelector('[data-testid="people-ptr-indicator"]')).toBeNull();
  });

  it('refreshes from the error state, where only a Retry button existed', () => {
    const refetch = vi.fn(() => Promise.resolve());
    useInboxMock.mockImplementation(() => inboxState({ data: [], isError: true, refetch }));
    render(<PeopleHome />);
    // The honest error state keeps its Retry button AND gains the gesture.
    expect(container!.textContent).toContain('Retry');
    const scroll = container!.querySelector('[data-testid="people-scroll"]') as HTMLElement;
    pull(scroll, 200);
    touch(scroll, 'touchend', 50, 300);
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe('Person thread pull-to-refresh (r5)', () => {
  it('fires onRefresh exactly once when pulled past the release line', async () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    render(<PersonThread conversation={makeConversation()} currentUserEmail={ME} onRefresh={onRefresh} />);
    const scroll = container!.querySelector('[data-testid="thread-scroll"]') as HTMLElement;
    expect(scroll).not.toBeNull();
    pull(scroll, 200);
    expect(container!.querySelector('[data-testid="thread-ptr-indicator"]')).not.toBeNull();
    touch(scroll, 'touchend', 50, 300);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    await act(async () => {
      await sleep(700);
    });
    expect(container!.querySelector('[data-testid="thread-ptr-indicator"]')).toBeNull();
  });

  it('stays dead without onRefresh: no indicator, no crash', () => {
    render(<PersonThread conversation={makeConversation()} currentUserEmail={ME} />);
    const scroll = container!.querySelector('[data-testid="thread-scroll"]') as HTMLElement;
    pull(scroll, 200);
    expect(container!.querySelector('[data-testid="thread-ptr-indicator"]')).toBeNull();
    touch(scroll, 'touchend', 50, 300);
    expect(container!.querySelector('[data-testid="thread-ptr-indicator"]')).toBeNull();
  });

  it('never fires when the reader is scrolled mid-thread', () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    render(<PersonThread conversation={makeConversation()} currentUserEmail={ME} onRefresh={onRefresh} />);
    const scroll = container!.querySelector('[data-testid="thread-scroll"]') as HTMLElement;
    // jsdom has no layout, so pin scrollTop via a getter override — the
    // hook reads currentTarget.scrollTop at touchstart, same as in prod.
    Object.defineProperty(scroll, 'scrollTop', { value: 240, configurable: true });
    pull(scroll, 200);
    touch(scroll, 'touchend', 50, 300);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(container!.querySelector('[data-testid="thread-ptr-indicator"]')).toBeNull();
  });
});
