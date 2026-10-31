// @vitest-environment jsdom
// ===========================================================================
// PeopleHome pillar search — the mobile-inbox P2 dead-field fix.
//
// Regression coverage for fix/qm-mobile-pillar-search: PeopleHome passed NO
// search props to AppShell, so the shell's pinned pillar search field (the
// mobile top bar) and desktop sidebar field rendered with no backing state —
// typing filtered nothing and Enter was a no-op — while PeopleList rendered
// its own working in-list filter below it. Two search boxes, one dead.
//
// The fix hands PeopleHome's existing filter state to the shell (the same
// pattern calendar, contacts, drive and the inbox already use). These tests
// render the REAL PeopleHome with a capturing AppShell stub (the real shell
// needs layout/router providers these suites don't mount; the shell ->
// pillar-bar wiring itself is covered by mobile-shell-overhaul and
// qm-uiux-030-search-tab-persistence) and prove the prop contract: the shell
// receives the live value + setter + placeholder, and driving the shell's
// setter filters the rendered people rows — one state, both boxes live.
// ===========================================================================

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
vi.mock('../hooks/useMailMutations', () => ({ useMailMutations: () => mutationsMock }));

// Capturing stub: records every AppShell prop PeopleHome passes so the tests
// can assert the shell contract without mounting the real shell's providers.
const shellProps = vi.hoisted(() => ({
  current: null as {
    searchValue?: string;
    onSearchChange?: (val: string) => void;
    searchPlaceholder?: string;
  } | null,
}));
vi.mock('../components/AppShell', () => ({
  AppShell: (props: {
    children: React.ReactNode;
    searchValue?: string;
    onSearchChange?: (val: string) => void;
    searchPlaceholder?: string;
  }) => {
    shellProps.current = props;
    return <>{props.children}</>;
  },
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

const bobEmail = () =>
  email({
    from: { email: 'bob@example.com', name: 'Bob' },
    to: [{ email: ME }],
    subject: 'Report',
    snippet: 'the quarterly report is ready',
    receivedAt: at('2026-10-10T09:00:00Z'),
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

function rowButtons(container: ParentNode): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('li > button'));
}

function inboxState(data: Email[]) {
  return {
    data,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    loadMore: vi.fn(),
    hasMore: false,
    isLoadingMore: false,
  };
}

beforeEach(() => {
  nav.push.mockClear();
  nav.lens = null;
  useInboxMock.mockReset();
  shellProps.current = null;
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

describe('PeopleHome pillar search wiring', () => {
  it('passes its live filter state to AppShell so the pillar/sidebar field is not dead', () => {
    useInboxMock.mockReturnValue(inboxState([aliceEmail(), bobEmail()]));
    const el = render(<PeopleHome />);

    expect(rowButtons(el)).toHaveLength(2);
    expect(shellProps.current).not.toBeNull();
    expect(shellProps.current!.searchValue).toBe('');
    expect(typeof shellProps.current!.onSearchChange).toBe('function');
    expect(shellProps.current!.searchPlaceholder).toBe('Search people and messages');
  });

  it('driving the shell search setter filters the people rows (one state, both boxes live)', () => {
    useInboxMock.mockReturnValue(inboxState([aliceEmail(), bobEmail()]));
    const el = render(<PeopleHome />);

    expect(rowButtons(el)).toHaveLength(2);
    act(() => {
      shellProps.current!.onSearchChange!('alice');
    });

    // The shell prop reflects the new value, and the list filtered to Alice.
    expect(shellProps.current!.searchValue).toBe('alice');
    const rows = rowButtons(el);
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Alice');
    expect(el.textContent).not.toContain('Bob');
    // The in-list box shows the same value: one shared filter state.
    const inListInput = el.querySelector(
      'input[aria-label="Search people and messages"]',
    ) as HTMLInputElement;
    expect(inListInput.value).toBe('alice');
  });
});
