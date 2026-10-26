// @vitest-environment jsdom
// ============================================================================
// fix/qm-people-pull-to-refresh — PeopleHome pull-to-refresh wiring.
//
// The People home (the default mobile home) had no pull gesture: the shared
// `usePullToRefresh` hook was wired only into the classic inbox and classic
// thread view. These tests drive the REAL hook through touch events on the
// home's scroll container and prove the gesture fires the real inbox refetch
// — not a stub — while a short pull, a horizontal swipe, and the disabled
// paths never do. The error state keeps its Retry button AND gains the
// gesture: the indicator renders above the error branch, inside the same
// scroll container.
//
// Touch synthesis note: jsdom has no Touch constructor, so the events are
// plain bubbling Events with a `touches` array attached — exactly what the
// hook reads (`event.touches[0]`). React copies `touches` from the native
// event onto its synthetic event, so this drives the genuine handler path.
// ============================================================================

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Email } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ME = 'me@quantmail.in';

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
  useAuth: () => ({ user: { email: ME } }),
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

vi.mock('../services/api-client', () => ({
  apiClient: {
    listFollowUpReminders: () => Promise.resolve({ success: true, data: [] }),
    dismissFollowUpReminder: () =>
      Promise.resolve({ success: true, data: { message: 'Reminder dismissed' } }),
  },
}));

import { PeopleHome } from '../components/PeopleHome';

let seq = 0;
const at = (iso: string) => new Date(iso);

const email = (over: Partial<Email>): Email =>
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

const aliceEmail = () =>
  email({
    from: { email: 'alice@example.com', name: 'Alice' },
    to: [{ email: ME }],
    subject: 'Dinner',
    snippet: 'are we still on for friday?',
    receivedAt: at('2026-10-10T10:00:00Z'),
  });

function inboxState(data: Email[], over: Record<string, unknown> = {}) {
  return {
    data,
    isLoading: false,
    isError: false,
    refetch: vi.fn(() => Promise.resolve()),
    loadMore: vi.fn(),
    hasMore: false,
    isLoadingMore: false,
    ...over,
  };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function render(ui: React.ReactElement): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(ui);
  });
  return host;
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

/** A full pull: start at the top, drag 200px down (84px indicator travel, past the 56px line), release. */
function fullPull(el: Element): void {
  touch(el, 'touchstart', 100, 100);
  touch(el, 'touchmove', 100, 300);
  touch(el, 'touchend', 100, 300);
}

function scrollContainer(el: ParentNode): HTMLElement {
  return el.querySelector('[data-testid="people-scroll"]')!;
}

beforeEach(() => {
  nav.push.mockClear();
  nav.lens = null;
  useInboxMock.mockReset();
});

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
  }
  root = null;
  host?.remove();
  host = null;
});

describe('PeopleHome pull-to-refresh', () => {
  it('a full pull at the top fires the real inbox refetch and shows the refreshing indicator', () => {
    const refetch = vi.fn(() => Promise.resolve());
    useInboxMock.mockReturnValue(inboxState([aliceEmail()], { refetch }));
    const el = render(<PeopleHome />);
    const scroller = scrollContainer(el);

    touch(scroller, 'touchstart', 100, 100);
    touch(scroller, 'touchmove', 100, 300);
    expect(el.querySelector('[data-testid="ptr-indicator"]')?.textContent).toContain(
      'Release to refresh',
    );

    touch(scroller, 'touchend', 100, 300);
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(el.querySelector('[data-testid="ptr-indicator"]')?.textContent).toContain(
      'Refreshing conversations…',
    );
  });

  it('a short pull shows the hint but never fires a refresh', () => {
    const refetch = vi.fn(() => Promise.resolve());
    useInboxMock.mockReturnValue(inboxState([aliceEmail()], { refetch }));
    const el = render(<PeopleHome />);
    const scroller = scrollContainer(el);

    touch(scroller, 'touchstart', 100, 100);
    touch(scroller, 'touchmove', 100, 150);
    expect(el.querySelector('[data-testid="ptr-indicator"]')?.textContent).toContain(
      'Pull down to refresh',
    );

    touch(scroller, 'touchend', 100, 150);
    expect(refetch).not.toHaveBeenCalled();
    expect(el.querySelector('[data-testid="ptr-indicator"]')).toBeNull();
  });

  it('a horizontal swipe never fires a refresh', () => {
    const refetch = vi.fn(() => Promise.resolve());
    useInboxMock.mockReturnValue(inboxState([aliceEmail()], { refetch }));
    const el = render(<PeopleHome />);
    const scroller = scrollContainer(el);

    touch(scroller, 'touchstart', 100, 100);
    touch(scroller, 'touchmove', 300, 110);
    touch(scroller, 'touchend', 300, 110);
    expect(refetch).not.toHaveBeenCalled();
    expect(el.querySelector('[data-testid="ptr-indicator"]')).toBeNull();
  });

  it('the error state keeps its Retry button and gains the pull gesture', () => {
    const refetch = vi.fn(() => Promise.resolve());
    useInboxMock.mockReturnValue(inboxState([], { isError: true, refetch }));
    const el = render(<PeopleHome />);

    const retry = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Retry'),
    );
    expect(retry).toBeTruthy();

    fullPull(scrollContainer(el));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
