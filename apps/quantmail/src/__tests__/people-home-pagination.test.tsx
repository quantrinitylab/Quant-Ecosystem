// @vitest-environment jsdom
// ============================================================================
// PeopleHome pagination — the newest-50 window fix.
//
// Regression coverage for the 2026-10-12 P1 [inbox-people]: PeopleHome called
// useInbox() with no pageSize and never called loadMore, so the default home
// grouped only the newest 50 messages — anyone whose mail was all older than
// that never got a person row, contradicting the locked "ek hi hona chahiye
// jisme mera sara message" rule, and the search box printed a misleading
// "No matches for …" for anything not yet loaded.
//
// These tests render the REAL PeopleHome with only the network/shell layers
// mocked (useInbox captures the pager tail, next/navigation, auth, chrome).
// Grouping (peopleGrouping) and PeopleList stay real, so the fix is proved
// through the genuine render path, not through the hook alone.
// ============================================================================

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Email } from '../types';

// React 19's act(...) requires this flag in the test environment.
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

// fix/qm-people-keyboard-triage: PeopleHome wires Superhuman-style keyboard
// triage through useMailMutations, which needs a react-query
// QueryClientProvider in production (provided by the root layout). These
// tests render without providers, so the sibling-owned hook is mocked
// against its contract — the same pattern ThreadComposer.test.tsx uses for
// the /people home suites. The keys are never pressed here, so the fns are
// never invoked; they only need to exist.
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

// Button must stay a working button for the wiring assertions; Skeleton is
// irrelevant chrome here.
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

// fix/qm-followup-resurface: PeopleHome now mounts PeopleDueReminders, which
// reads GET /follow-up-reminders on mount. These pagination tests are about
// the corpus pager, not delivery — keep the endpoint empty here so no real
// network is attempted and the strip stays out of the assertions.
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

// New mail — inside the first page.
const aliceEmail = () =>
  email({
    from: { email: 'alice@example.com', name: 'Alice' },
    to: [{ email: ME }],
    subject: 'Dinner',
    snippet: 'are we still on for friday?',
    receivedAt: at('2026-10-10T10:00:00Z'),
  });

// Old mail — beyond the first page; only visible after loadMore.
const oldBobEmail = () =>
  email({
    from: { email: 'old-bob@example.com', name: 'Old Bob' },
    to: [{ email: ME }],
    subject: 'Long time',
    snippet: 'remember me from last year?',
    receivedAt: at('2025-09-01T10:00:00Z'),
  });

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

function rerender(ui: React.ReactElement): void {
  act(() => {
    root!.render(ui);
  });
}

function rowButtons(container: ParentNode): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('li > button'));
}

function loadMoreButton(container: ParentNode): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) =>
    b.textContent?.includes('Load more people'),
  );
}

function inboxState(data: Email[], over: Record<string, unknown> = {}) {
  return {
    data,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    loadMore: vi.fn(),
    hasMore: false,
    isLoadingMore: false,
    ...over,
  };
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

describe('PeopleHome corpus pagination', () => {
  it('shows only first-page people until "Load more people" is tapped, then reveals the older person', () => {
    const loadMore = vi.fn();
    const alice = aliceEmail();
    const oldBob = oldBobEmail();

    // First page: only Alice. The server has more (Old Bob is older).
    useInboxMock.mockReturnValue(inboxState([alice], { hasMore: true, loadMore }));
    const el = render(<PeopleHome />);

    expect(el.textContent).toContain('Alice');
    expect(el.textContent).not.toContain('Old Bob');
    const tail = loadMoreButton(el);
    expect(tail).toBeTruthy();

    act(() => {
      tail!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(loadMore).toHaveBeenCalledTimes(1);

    // The pager merges the tail behind the first page: Old Bob now groups.
    useInboxMock.mockReturnValue(inboxState([alice, oldBob], { hasMore: false, loadMore }));
    rerender(<PeopleHome />);

    expect(el.textContent).toContain('Alice');
    expect(el.textContent).toContain('Old Bob');
    expect(rowButtons(el)).toHaveLength(2);
    // Corpus exhausted: the tail hides.
    expect(loadMoreButton(el)).toBeUndefined();
  });

  it('passes isLoadingMore through as a disabled tail', () => {
    useInboxMock.mockReturnValue(
      inboxState([aliceEmail()], { hasMore: true, isLoadingMore: true }),
    );
    const el = render(<PeopleHome />);

    const tail = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Loading…'),
    )!;
    expect(tail).toBeTruthy();
    expect(tail.hasAttribute('disabled')).toBe(true);
  });

  it('search stays honest while pages remain: no misleading "No matches for …"', () => {
    useInboxMock.mockReturnValue(inboxState([aliceEmail()], { hasMore: true }));
    const el = render(<PeopleHome />);

    const input = el.querySelector('input[aria-label="Search people and messages"]')!;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!;
    act(() => {
      setter.call(input, 'zzz-no-such-person');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(el.textContent).toContain('No matches in the loaded messages');
    expect(el.textContent).not.toContain('No matches for');
    expect(
      Array.from(el.querySelectorAll('button')).some((b) =>
        b.textContent?.includes('Load older messages to keep searching'),
      ),
    ).toBe(true);
  });
});
