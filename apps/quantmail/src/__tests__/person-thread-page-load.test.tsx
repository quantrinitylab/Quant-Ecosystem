// @vitest-environment jsdom
// ============================================================================
// /people/[personId] corpus hunt — the newest-50 window fix, one surface over.
//
// Regression coverage for the 2026-10-13 P1 [people-thread]: the detail page
// destructured only { data, isLoading, isError, refetch } from useInbox and
// never called loadMore, so it grouped the newest-50 first-page window only.
// A person whose mail was entirely older than that rendered "Conversation
// not found" even though they exist — and now that PeopleHome pages, a user
// can tap an older person's row and land on that lie.
//
// The fix: the page destructures loadMore/hasMore/isLoadingMore and hunts
// the corpus — one keyset slice at a time while the personKey is absent and
// the pager reports more pages — rendering an honest "Looking through your
// older messages…" state while hunting, and only saying "not found" once
// the corpus is genuinely exhausted.
//
// These tests render the REAL page with only the network/shell layers mocked
// (useInbox captures the pager tail, next/navigation, auth, chrome). Grouping
// (peopleGrouping) stays real, so the fix is proved through the genuine
// render path, not through the hook alone.
//
// NOTE on createRoot vs renderToStaticMarkup: the hunt is a useEffect loop,
// and renderToStaticMarkup never executes effects — it cannot prove the fix.
// The merged sibling suite for this exact bug class
// (people-home-pagination.test.tsx) uses createRoot + act and is CI-green;
// this suite follows that proven pattern. No @testing-library/react anywhere
// (it is not a quantmail dependency; CI's frozen install would fail on it).
// ============================================================================

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Email } from '../types';
import type { PersonConversation } from '../lib/peopleGrouping';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ME = 'me@quantmail.in';
const OLD_BOB = 'old-bob@example.com';
const ALICE = 'alice@example.com';

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  lens: null as string | null,
  // NOTE: hoisted factories run before module consts initialize — the
  // default personId is a literal, not the OLD_BOB const below.
  personId: 'old-bob@example.com',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push }),
  useParams: () => ({ personId: nav.personId }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'lens' ? nav.lens : null),
  }),
}));

// next/link renders through the app-router context; in the test shell it is
// plain chrome — a real anchor keeps the back-link assertions honest.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('../providers/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'u1', email: ME } }),
}));

const useInboxMock = vi.hoisted(() => vi.fn());
vi.mock('../hooks/useInbox', () => ({ useInbox: useInboxMock }));

vi.mock('../hooks/useMailMutations', () => ({
  useMailMutations: () => ({
    archive: vi.fn(),
    markUnread: vi.fn(),
    toggleStar: vi.fn(),
  }),
}));

// Keyboard shortcuts are chrome for this fix; they must not throw at render.
vi.mock('../hooks/useThreadViewKeyboard', () => ({
  useThreadViewKeyboard: () => {},
}));

vi.mock('../components/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../components/AppSidebar', () => ({
  AppSidebar: () => null,
}));

// The thread itself is the render target the hunt must eventually reach; a
// stub that prints the person's name proves the page found the conversation
// without dragging the real composer's dependencies into the test.
vi.mock('../components/PersonThread', () => ({
  PersonThread: ({ conversation }: { conversation: PersonConversation }) => (
    <div data-testid="person-thread">thread:{conversation.name}</div>
  ),
}));

vi.mock('../components/ThreadComposer', () => ({
  ThreadComposer: () => null,
}));

vi.mock('../components/SmartReplySuggestions', () => ({
  SmartReplySuggestions: () => null,
}));

// The page is the default export of a route file; the static import below
// resolves after the hoisted vi.mock calls, mirroring the sibling suite.
import PersonPage from '../app/(app)/people/[personId]/page';

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
    from: { email: ALICE, name: 'Alice' },
    to: [{ email: ME }],
    subject: 'Dinner',
    snippet: 'are we still on for friday?',
  });

// Old mail — beyond the first page; only visible after loadMore.
const oldBobEmail = () =>
  email({
    from: { email: OLD_BOB, name: 'Old Bob' },
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
  nav.personId = OLD_BOB;
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

describe('/people/[personId] corpus hunt', () => {
  it('hunts instead of lying: an absent person with pages remaining shows the searching state, never "Conversation not found"', () => {
    const loadMore = vi.fn();
    useInboxMock.mockReturnValue(inboxState([aliceEmail()], { hasMore: true, loadMore }));

    const el = render(<PersonPage />);

    expect(el.textContent).toContain('Looking through your older messages');
    expect(el.textContent).not.toContain('Conversation not found');
    // The hunt fires automatically — no user tap needed on a detail page.
    expect(loadMore).toHaveBeenCalled();
  });

  it('one slice at a time: the hunt keeps paging until the person is found, then the thread renders', () => {
    const loadMore = vi.fn();
    const alice = aliceEmail();
    const oldBob = oldBobEmail();

    // First page: Alice only; Old Bob is older. The hunt fires.
    useInboxMock.mockReturnValue(inboxState([alice], { hasMore: true, loadMore }));
    const el = render(<PersonPage />);
    expect(loadMore).toHaveBeenCalledTimes(1);

    // The pager merges the tail behind the first page: Old Bob now groups —
    // the hunt stops because the conversation is found.
    useInboxMock.mockReturnValue(inboxState([alice, oldBob], { hasMore: false, loadMore }));
    rerender(<PersonPage />);

    expect(loadMore).toHaveBeenCalledTimes(1);
    expect(el.querySelector('[data-testid="person-thread"]')?.textContent).toContain('Old Bob');
    expect(el.textContent).not.toContain('Looking through your older messages');
    expect(el.textContent).not.toContain('Conversation not found');
  });

  it('never hunts when the person is already in the loaded window', () => {
    const loadMore = vi.fn();
    nav.personId = ALICE;
    useInboxMock.mockReturnValue(inboxState([aliceEmail()], { hasMore: true, loadMore }));

    const el = render(<PersonPage />);

    expect(loadMore).not.toHaveBeenCalled();
    expect(el.querySelector('[data-testid="person-thread"]')?.textContent).toContain('Alice');
    expect(el.textContent).not.toContain('Looking through your older messages');
  });

  it('an exhausted corpus is an honest "not found" — no hunt, with a way back', () => {
    const loadMore = vi.fn();
    useInboxMock.mockReturnValue(inboxState([aliceEmail()], { hasMore: false, loadMore }));

    const el = render(<PersonPage />);

    expect(loadMore).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Conversation not found');
    expect(el.textContent).not.toContain('Looking through your older messages');
    // Two /people anchors exist (the header back-arrow and the button); the
    // button is the one carrying the "Back to people" label.
    const back = Array.from(el.querySelectorAll('a[href="/people"]')).find((a) =>
      a.textContent?.includes('Back to people'),
    );
    expect(back).toBeTruthy();
  });

  it('a stuck pager stops hunting and says so honestly instead of loop-spinning', () => {
    const loadMore = vi.fn();
    // First page: Alice only; the pager claims more. The hunt fires once.
    useInboxMock.mockReturnValue(inboxState([aliceEmail()], { hasMore: true, loadMore }));
    const el = render(<PersonPage />);
    expect(loadMore).toHaveBeenCalledTimes(1);

    // Simulate one hunt cycle completing with NO new mail arriving (e.g. the
    // page request keeps failing — loadMore toasts internally and leaves the
    // cursor untouched). Without the anti-loop guard the hunt would fire
    // loadMore again here, toast-spamming forever.
    useInboxMock.mockReturnValue(
      inboxState([aliceEmail()], { hasMore: true, isLoadingMore: true, loadMore }),
    );
    rerender(<PersonPage />);
    useInboxMock.mockReturnValue(inboxState([aliceEmail()], { hasMore: true, loadMore }));
    rerender(<PersonPage />);

    expect(loadMore).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain("Couldn't load older messages");
    expect(el.textContent).not.toContain('Looking through your older messages');
    expect(el.textContent).not.toContain('Conversation not found');
  });

  it('the stuck-hunt retry resets the guard so the hunt can run again', () => {
    const loadMore = vi.fn();
    useInboxMock.mockReturnValue(inboxState([aliceEmail()], { hasMore: true, loadMore }));
    const el = render(<PersonPage />);
    useInboxMock.mockReturnValue(
      inboxState([aliceEmail()], { hasMore: true, isLoadingMore: true, loadMore }),
    );
    rerender(<PersonPage />);
    useInboxMock.mockReturnValue(inboxState([aliceEmail()], { hasMore: true, loadMore }));
    rerender(<PersonPage />);
    expect(el.textContent).toContain("Couldn't load older messages");

    // The Retry button clears the stuck flag and refetches (which resets the
    // pager); the hunt fires again on the next settled pass.
    const retry = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Retry'),
    );
    expect(retry).toBeTruthy();
    act(() => {
      retry!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(el.textContent).toContain('Looking through your older messages');
    expect(loadMore).toHaveBeenCalledTimes(2);
  });

  it('a failed fetch is not "not found": the retry state stays honest and the hunt does not fire', () => {
    const loadMore = vi.fn();
    useInboxMock.mockReturnValue(inboxState([], { isError: true, hasMore: true, loadMore }));

    const el = render(<PersonPage />);

    expect(loadMore).not.toHaveBeenCalled();
    expect(el.textContent).toContain("Couldn't load this conversation");
    expect(el.textContent).not.toContain('Conversation not found');
    expect(el.textContent).not.toContain('Looking through your older messages');
  });

  it('the initial load still shows the loading state, not the hunt', () => {
    const loadMore = vi.fn();
    useInboxMock.mockReturnValue(
      inboxState([], { isLoading: true, data: undefined, hasMore: true, loadMore }),
    );

    const el = render(<PersonPage />);

    expect(loadMore).not.toHaveBeenCalled();
    expect(el.querySelector('[aria-label="Loading conversation"]')).toBeTruthy();
    expect(el.textContent).not.toContain('Looking through your older messages');
    expect(el.textContent).not.toContain('Conversation not found');
  });

  it('the spam lens hunts the spam dataset and points back at the spam view', () => {
    const loadMore = vi.fn();
    nav.lens = 'spam';
    const spamMail = email({
      from: { email: 'spammy@example.com', name: 'Spammy' },
      to: [{ email: ME }],
      subject: 'You won',
    });
    useInboxMock.mockReturnValue(inboxState([spamMail], { hasMore: false, loadMore }));

    const el = render(<PersonPage />);

    expect(useInboxMock).toHaveBeenCalledWith({ folderType: 'SPAM' });
    expect(loadMore).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Conversation not found');
    expect(el.querySelector('a[href="/?lens=spam"]')).toBeTruthy();
  });
});
