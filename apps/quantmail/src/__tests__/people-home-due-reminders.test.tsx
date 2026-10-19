// @vitest-environment jsdom
// ============================================================================
// PeopleHome due-reminder delivery — fix/qm-followup-resurface (P1).
//
// The finding: persistence for follow-up reminders was real, but no code
// ever delivered a due reminder — four comments claimed "the People home
// resurfaces due reminders at the top of the conversation list" and none
// did. These tests prove the delivery half through the REAL PeopleHome
// (only network/shell layers mocked, grouping and list stay real):
//   1. A due reminder for a loaded thread renders the strip ABOVE the
//      person rows, with the real person's name.
//   2. Tapping the row opens that person's thread.
//   3. A future reminder renders nothing (not deliverable yet).
//   4. A failed fetch degrades silently — no strip, no crash, no fake rows.
//   5. Dismiss removes the row via the real DELETE call.
// ============================================================================

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Email } from '../types';
import type { FollowUpReminder } from '../services/api-client';

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

vi.mock('../components/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../components/AppSidebar', () => ({
  AppSidebar: () => null,
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

// The delivery path under test: the REAL endpoint is replaced with a
// controllable double — the strip must read from it, never invent rows.
const apiDouble = vi.hoisted(() => ({
  list: vi.fn(),
  dismiss: vi.fn(),
}));
vi.mock('../services/api-client', () => ({
  apiClient: {
    listFollowUpReminders: apiDouble.list,
    dismissFollowUpReminder: apiDouble.dismiss,
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

// A sent, unanswered thread from me to Alice — the follow-up target.
const aliceThread = () =>
  email({
    id: 'm-alice-1',
    threadId: 't-alice',
    from: { email: ME },
    to: [{ email: 'alice@example.com', name: 'Alice' }],
    subject: 'Dinner',
    snippet: 'are we still on for friday?',
  });

function reminder(over: Partial<FollowUpReminder> = {}): FollowUpReminder {
  return {
    id: 'r1',
    emailId: 'm-alice-1',
    threadId: 't-alice',
    subject: 'Dinner',
    remindAt: new Date(Date.now() - 3_600_000).toISOString(),
    createdAt: new Date(Date.now() - 7_200_000).toISOString(),
    ...over,
  };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

/**
 * fix/qm-people-snooze: PeopleHome now calls useMailMutations() (snooze on
 * the home rows), which needs a QueryClientProvider — the root layout
 * provides it in production. Fresh client per render so no query cache leaks
 * between tests.
 */
function withProviders(ui: React.ReactElement): React.ReactElement {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>;
}

async function renderHome(): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(withProviders(<PeopleHome />));
  });
  return host;
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
  apiDouble.list.mockReset();
  apiDouble.dismiss.mockReset();
  apiDouble.list.mockResolvedValue({ success: true, data: [] });
  apiDouble.dismiss.mockResolvedValue({ success: true, data: { message: 'Reminder dismissed' } });
  // Midnight-safe clock: formatRelativeTime() day-buckets on LOCAL calendar
  // days, so a fixed "1h ago" fixture flips to "Yesterday" when the suite runs
  // in the first hour after midnight (CI in UTC hits this nightly, failing
  // full-sweep). Pin system time to local midday so the label is deterministic.
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
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
  vi.useRealTimers();
});

describe('PeopleHome due-reminder delivery', () => {
  it('resurfaces a due reminder ABOVE the person rows with the real person name', async () => {
    apiDouble.list.mockResolvedValue({ success: true, data: [reminder()] });
    useInboxMock.mockReturnValue(inboxState([aliceThread()]));
    const el = await renderHome();

    const section = el.querySelector('section[aria-label="Due follow-up reminders"]');
    expect(section).toBeTruthy();
    expect(section!.textContent).toContain('Alice');
    expect(section!.textContent).toContain('Due 1h');
    // The strip sits above the conversation list in DOM order (nudge-style).
    const list = el.querySelector('ul');
    expect(list).toBeTruthy();
    expect(
      // eslint-disable-next-line no-bitwise
      (section!.compareDocumentPosition(list!) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    ).toBe(true);
    // The endpoint was actually read — no invented rows.
    expect(apiDouble.list).toHaveBeenCalledTimes(1);
  });

  it('tapping the row opens that person thread', async () => {
    apiDouble.list.mockResolvedValue({ success: true, data: [reminder()] });
    useInboxMock.mockReturnValue(inboxState([aliceThread()]));
    const el = await renderHome();

    const open = el.querySelector(
      '[data-testid="due-reminder-row"] button[aria-label^="Open follow-up:"]',
    ) as HTMLButtonElement;
    expect(open).toBeTruthy();
    await act(async () => {
      open.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(nav.push).toHaveBeenCalledWith('/people/alice%40example.com');
  });

  it('dismiss removes the row via the real DELETE call', async () => {
    apiDouble.list.mockResolvedValue({ success: true, data: [reminder()] });
    useInboxMock.mockReturnValue(inboxState([aliceThread()]));
    const el = await renderHome();

    expect(el.querySelector('[data-testid="due-reminder-row"]')).toBeTruthy();
    const dismiss = el.querySelector(
      '[data-testid="due-reminder-row"] button[aria-label^="Dismiss reminder:"]',
    ) as HTMLButtonElement;
    await act(async () => {
      dismiss.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(apiDouble.dismiss).toHaveBeenCalledWith('r1');
    expect(el.querySelector('[data-testid="due-reminder-row"]')).toBeNull();
  });

  it('a future reminder renders no strip (not deliverable yet)', async () => {
    apiDouble.list.mockResolvedValue({
      success: true,
      data: [reminder({ remindAt: new Date(Date.now() + 3_600_000).toISOString() })],
    });
    useInboxMock.mockReturnValue(inboxState([aliceThread()]));
    const el = await renderHome();

    expect(el.querySelector('section[aria-label="Due follow-up reminders"]')).toBeNull();
    expect(el.querySelector('[data-testid="due-reminder-row"]')).toBeNull();
  });

  it('a failed fetch degrades silently — no strip, no crash, no fake rows', async () => {
    apiDouble.list.mockRejectedValue(new Error('network down'));
    useInboxMock.mockReturnValue(inboxState([aliceThread()]));
    const el = await renderHome();

    expect(el.querySelector('section[aria-label="Due follow-up reminders"]')).toBeNull();
    // The person list itself still renders — the nudge failing must not
    // take the home down with it.
    expect(el.textContent).toContain('Alice');
  });

  it('a reminder for unloaded mail still surfaces with the subject (honest fallback)', async () => {
    apiDouble.list.mockResolvedValue({
      success: true,
      data: [reminder({ threadId: 't-not-loaded', emailId: 'm-not-loaded' })],
    });
    useInboxMock.mockReturnValue(inboxState([aliceThread()]));
    const el = await renderHome();

    const row = el.querySelector('[data-testid="due-reminder-row"]');
    expect(row).toBeTruthy();
    expect(row!.textContent).toContain('Dinner');
    // Deep-links to the thread view instead of a dead end.
    const open = row!.querySelector(
      'button[aria-label^="Open follow-up:"]',
    ) as HTMLButtonElement;
    expect(open).toBeTruthy();
    await act(async () => {
      open.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(nav.push).toHaveBeenCalledWith('/thread/t-not-loaded');
  });
});
