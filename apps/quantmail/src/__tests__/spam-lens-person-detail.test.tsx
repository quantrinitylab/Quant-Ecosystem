// @vitest-environment jsdom
// ============================================================================
// Spam-lens person detail — the dead-end fix.
//
// Regression coverage for the 2026-10-11 P1: PeopleHome under `?lens=spam`
// builds person rows from the SPAM folder query, but the detail route
// `/people/[personId]` used the default INBOX dataset, so tapping a
// spam-lens row landed on "Conversation not found". The fix carries the lens
// through the route and honors it on the detail page.
//
// These tests render the REAL PeopleHome and the REAL person detail page,
// with only the network/shell layers mocked: useInbox (captures its folder
// options so the lens->folder mapping is asserted), next/navigation, auth,
// and the shell/chrome components. Grouping (peopleGrouping) and the list
// rows stay real, so a row tap exercises the genuine handleSelect path.
// ============================================================================

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { groupEmailsByPerson } from '../lib/peopleGrouping';
import type { Email } from '../types';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ME = 'me@quantmail.in';

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  lens: null as string | null,
  personId: '',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push }),
  useParams: () => ({ personId: nav.personId }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'lens' ? nav.lens : null),
  }),
}));

vi.mock('../providers/auth-provider', () => ({
  useAuth: () => ({ user: { email: ME } }),
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

vi.mock('../hooks/useThreadViewKeyboard', () => ({
  useThreadViewKeyboard: () => {},
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

vi.mock('../components/PersonThread', () => ({
  PersonThread: ({ conversation }: { conversation: { name: string } }) => (
    <div data-testid="person-thread">{conversation.name}</div>
  ),
}));

vi.mock('../components/ThreadComposer', () => ({
  ThreadComposer: () => null,
}));

vi.mock('@quant/shared-ui', () => ({
  Skeleton: () => null,
}));

import { PeopleHome } from '../components/PeopleHome';
import PersonPage from '../app/people/[personId]/page';

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

// A person who exists ONLY in spam: never in the inbox dataset.
const spamPersonEmail = () =>
  email({
    from: { email: 'spammer@spam.example', name: 'Spammer' },
    to: [{ email: ME }],
    subject: 'You won a prize!!!',
    snippet: 'click here to claim',
    receivedAt: at('2026-10-10T11:00:00Z'),
  });

const inboxPersonEmail = () =>
  email({
    from: { email: 'alice@example.com', name: 'Alice' },
    to: [{ email: ME }],
    subject: 'Dinner',
    snippet: 'are we still on for friday?',
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
  return { data, isLoading: false, isError: false, refetch: vi.fn() };
}

beforeEach(() => {
  nav.push.mockClear();
  nav.lens = null;
  nav.personId = '';
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

describe('spam lens: list carries the lens, detail honors it', () => {
  it('PeopleHome under ?lens=spam queries the SPAM folder', () => {
    nav.lens = 'spam';
    useInboxMock.mockReturnValue(inboxState([spamPersonEmail()]));

    render(<PeopleHome />);

    expect(useInboxMock).toHaveBeenCalledWith({ folderType: 'SPAM' });
    expect(document.body.textContent).toContain('Spammer');
  });

  it('tapping a spam-lens row routes to the person detail WITH the lens', () => {
    nav.lens = 'spam';
    useInboxMock.mockReturnValue(inboxState([spamPersonEmail()]));

    const el = render(<PeopleHome />);

    const spammerRow = rowButtons(el).find((b) => b.textContent?.includes('Spammer'))!;
    act(() => {
      spammerRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(nav.push).toHaveBeenCalledTimes(1);
    expect(nav.push).toHaveBeenCalledWith('/people/spammer%40spam.example?lens=spam');
  });

  it('without a lens the person route stays plain', () => {
    nav.lens = null;
    useInboxMock.mockReturnValue(inboxState([inboxPersonEmail()]));

    const el = render(<PeopleHome />);

    expect(useInboxMock).toHaveBeenCalledWith(undefined);
    const aliceRow = rowButtons(el).find((b) => b.textContent?.includes('Alice'))!;
    act(() => {
      aliceRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(nav.push).toHaveBeenCalledWith('/people/alice%40example.com');
  });
});

describe('person detail page honors ?lens=spam', () => {
  it('queries the SPAM folder and finds the spam-only person (no dead end)', () => {
    nav.lens = 'spam';
    nav.personId = 'spammer%40spam.example';
    // The detail page sees the SAME spam dataset the list row was built from.
    useInboxMock.mockReturnValue(inboxState([spamPersonEmail()]));

    const el = render(<PersonPage />);

    expect(useInboxMock).toHaveBeenCalledWith({ folderType: 'SPAM' });
    expect(el.querySelector('[data-testid="person-thread"]')).not.toBeNull();
    expect(el.textContent).toContain('Spammer');
    expect(el.textContent).not.toContain('Conversation not found');
  });

  it('without a lens it keeps the default INBOX query and the /people back link', () => {
    nav.lens = null;
    nav.personId = 'alice%40example.com';
    useInboxMock.mockReturnValue(inboxState([inboxPersonEmail()]));

    const el = render(<PersonPage />);

    expect(useInboxMock).toHaveBeenCalledWith(undefined);
    expect(el.querySelector('[data-testid="person-thread"]')).not.toBeNull();
    const backLink = el.querySelector('a[aria-label="Back to people"]');
    expect(backLink?.getAttribute('href')).toBe('/people');
  });

  it('a genuinely missing person under ?lens=spam gets the spam-aware not-found copy and back link', () => {
    nav.lens = 'spam';
    nav.personId = 'gone%40spam.example';
    useInboxMock.mockReturnValue(inboxState([]));

    const el = render(<PersonPage />);

    expect(el.textContent).toContain('Conversation not found');
    // Honest about WHERE it was looked for — not the generic archive claim.
    expect(el.textContent).toContain("isn't in your spam conversations");
    const backLink = el.querySelector('a[aria-label="Back to people"]');
    expect(backLink?.getAttribute('href')).toBe('/?lens=spam');
  });
});
