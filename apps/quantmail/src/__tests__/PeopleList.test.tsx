// @vitest-environment jsdom
// ============================================================================
// PeopleList — the conversation list of the unified People view.
//
// Renders the REAL component and drives the REAL controls, asserting only
// observable behaviour: rows render, the search box filters them, the unread
// pill appears exactly when the real unread count is above zero, and tapping a
// row calls onSelect with that conversation.
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PeopleList, formatRelativeTime } from '../components/PeopleList';
import { groupEmailsByPerson, type PersonConversation } from '../lib/peopleGrouping';
import type { Email } from '../types';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// framer-motion's useReducedMotion (used by Skeleton) reads matchMedia, which
// jsdom does not implement. The shim is a test-environment concern, not product
// behaviour: reduced-motion is off so skeletons render their default markup.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
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

let seq = 0;
const at = (iso: string) => new Date(iso);

const email = (over: Partial<Email> & { isSent?: boolean }): Email =>
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

function fixtureConversations(): PersonConversation[] {
  const aliceInbound = email({
    from: { email: 'alice@example.com', name: 'Alice' },
    to: [{ email: ME }],
    subject: 'Dinner',
    snippet: 'are we still on for friday?',
    isRead: false,
    receivedAt: at('2026-10-10T09:00:00Z'),
  });
  const aliceInboundRead = email({
    from: { email: 'alice@example.com', name: 'Alice' },
    to: [{ email: ME }],
    subject: 'Dinner',
    snippet: 'let me know',
    isRead: true,
    receivedAt: at('2026-10-10T09:01:00Z'),
  });
  const bobInbound = email({
    from: { email: 'bob@example.com', name: 'Bob' },
    to: [{ email: ME }],
    subject: 'Report',
    snippet: 'the quarterly report is ready',
    isRead: true,
    receivedAt: at('2026-10-10T08:00:00Z'),
  });
  // Alice: 1 real unread. Bob: 0.
  return groupEmailsByPerson([aliceInbound, aliceInboundRead, bobInbound], ME);
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

function rowButtons(container: ParentNode): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('li > button'));
}

function setSearchValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Stateful harness: the search box is controlled, like the real parent. */
function Harness({
  conversations,
  onSelect,
  onLoadMore,
  hasMore = false,
  loadingMore = false,
}: {
  conversations: PersonConversation[];
  onSelect: (c: PersonConversation) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}) {
  const [query, setQuery] = useState('');
  return (
    <PeopleList
      conversations={conversations}
      onSelect={onSelect}
      searchQuery={query}
      onSearchQuery={setQuery}
      onLoadMore={onLoadMore}
      hasMore={hasMore}
      loadingMore={loadingMore}
    />
  );
}

describe('PeopleList', () => {
  it('renders one row per conversation with name, snippet, and relative time', () => {
    const conversations = fixtureConversations();
    const el = render(
      <PeopleList
        conversations={conversations}
        onSelect={() => {}}
        searchQuery=""
        onSearchQuery={() => {}}
      />,
    );

    const rows = rowButtons(el);
    expect(rows).toHaveLength(2);
    expect(el.textContent).toContain('Alice');
    expect(el.textContent).toContain('Bob');
    // Snippet of the latest message per conversation (1-line preview).
    expect(el.textContent).toContain('let me know');
    expect(el.textContent).toContain('the quarterly report is ready');
    // Placeholder copy is honest, not marketing.
    expect(el.querySelector('input')?.placeholder).toBe('Search people and messages');
  });

  it('shows the unread pill with the real count only when it is above zero', () => {
    const conversations = fixtureConversations();
    const el = render(
      <PeopleList
        conversations={conversations}
        onSelect={() => {}}
        searchQuery=""
        onSearchQuery={() => {}}
      />,
    );

    const pills = el.querySelectorAll('[data-testid="unread-count"]');
    // Alice has exactly 1 real unread; Bob has 0 and renders no pill.
    expect(pills).toHaveLength(1);
    expect(pills[0].textContent).toBe('1');
    const aliceRow = rowButtons(el).find((b) => b.textContent?.includes('Alice'))!;
    expect(aliceRow.getAttribute('aria-label')).toBe('Alice, 1 unread');
    const bobRow = rowButtons(el).find((b) => b.textContent?.includes('Bob'))!;
    expect(bobRow.getAttribute('aria-label')).toBe('Bob');
  });

  it('filters rows as the search query changes (name, email, subject, snippet)', () => {
    const conversations = fixtureConversations();
    const el = render(<Harness conversations={conversations} onSelect={() => {}} />);
    const input = el.querySelector('input')!;

    setSearchValue(input, 'quarterly');
    expect(rowButtons(el)).toHaveLength(1);
    expect(el.textContent).toContain('Bob');
    expect(el.textContent).not.toContain('Alice');

    setSearchValue(input, 'alice@example.com');
    expect(rowButtons(el)).toHaveLength(1);
    expect(el.textContent).toContain('Alice');
  });

  it('shows the honest empty states', () => {
    const empty = render(
      <PeopleList conversations={[]} onSelect={() => {}} searchQuery="" onSearchQuery={() => {}} />,
    );
    expect(empty.textContent).toContain('No conversations yet');

    const noMatch = render(
      <Harness conversations={fixtureConversations()} onSelect={() => {}} />,
    );
    setSearchValue(noMatch.querySelector('input')!, 'zzz-no-such-person');
    expect(rowButtons(noMatch)).toHaveLength(0);
    expect(noMatch.textContent).toContain('No matches');
  });

  it('calls onSelect with the tapped conversation', () => {
    const conversations = fixtureConversations();
    const onSelect = vi.fn();
    const el = render(<Harness conversations={conversations} onSelect={onSelect} />);

    const bobRow = rowButtons(el).find((b) => b.textContent?.includes('Bob'))!;
    act(() => {
      bobRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ personKey: 'bob@example.com' }),
    );
    // The exact conversation object, not a copy.
    expect(onSelect.mock.calls[0][0]).toBe(
      conversations.find((c) => c.personKey === 'bob@example.com'),
    );
  });

  it('renders skeleton rows while loading', () => {
    const el = render(
      <PeopleList
        conversations={[]}
        onSelect={() => {}}
        searchQuery=""
        onSearchQuery={() => {}}
        loading
      />,
    );
    expect(el.querySelector('[role="status"]')).not.toBeNull();
    expect(rowButtons(el)).toHaveLength(0);
  });

  it('shows "Load more people" only when the server has more pages, and calls onLoadMore on tap', () => {
    const conversations = fixtureConversations();
    const onLoadMore = vi.fn();
    const el = render(
      <PeopleList
        conversations={conversations}
        onSelect={() => {}}
        searchQuery=""
        onSearchQuery={() => {}}
        onLoadMore={onLoadMore}
        hasMore
      />,
    );

    const buttons = Array.from(el.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('Load more people'),
    );
    expect(buttons).toHaveLength(1);
    act(() => {
      buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    // No more pages: the tail hides, even with a handler wired.
    const exhausted = render(
      <PeopleList
        conversations={conversations}
        onSelect={() => {}}
        searchQuery=""
        onSearchQuery={() => {}}
        onLoadMore={onLoadMore}
        hasMore={false}
      />,
    );
    expect(
      Array.from(exhausted.querySelectorAll('button')).some((b) =>
        b.textContent?.includes('Load more people'),
      ),
    ).toBe(false);

    // No handler: the tail hides even when the server has more.
    const noHandler = render(
      <PeopleList
        conversations={conversations}
        onSelect={() => {}}
        searchQuery=""
        onSearchQuery={() => {}}
        hasMore
      />,
    );
    expect(
      Array.from(noHandler.querySelectorAll('button')).some((b) =>
        b.textContent?.includes('Load more people'),
      ),
    ).toBe(false);
  });

  it('disables the tail and says "Loading…" while a page is in flight', () => {
    const conversations = fixtureConversations();
    const el = render(
      <PeopleList
        conversations={conversations}
        onSelect={() => {}}
        searchQuery=""
        onSearchQuery={() => {}}
        onLoadMore={() => {}}
        hasMore
        loadingMore
      />,
    );

    const button = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Loading…'),
    )!;
    expect(button).toBeTruthy();
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('search with no matches stays honest: offers older mail while pages remain, "No matches" only when exhausted', () => {
    const conversations = fixtureConversations();
    const onLoadMore = vi.fn();

    // Pages remain on the server: "No matches" would be a lie — the match
    // may simply not be loaded yet.
    const paged = render(
      <Harness conversations={conversations} onSelect={() => {}} onLoadMore={onLoadMore} hasMore />,
    );
    setSearchValue(paged.querySelector('input')!, 'zzz-no-such-person');
    expect(rowButtons(paged)).toHaveLength(0);
    expect(paged.textContent).toContain('No matches in the loaded messages');
    expect(paged.textContent).not.toContain('No matches for');
    const keepSearching = Array.from(paged.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Load older messages to keep searching'),
    )!;
    expect(keepSearching).toBeTruthy();
    act(() => {
      keepSearching.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    // Corpus exhausted: "No matches for …" is now the truth.
    const done = render(<Harness conversations={conversations} onSelect={() => {}} />);
    setSearchValue(done.querySelector('input')!, 'zzz-no-such-person');
    expect(rowButtons(done)).toHaveLength(0);
    expect(done.textContent).toContain('No matches for');
    expect(done.textContent).not.toContain('No matches in the loaded messages');
  });
});

describe('formatRelativeTime', () => {
  it('says "now" for the last minute and "Xm"/"Xh" within the day', () => {
    // Pin the clock to midday so a relative offset can never cross a calendar
    // day boundary: without this, running at ~00:3x UTC makes "2h ago" land on
    // the previous calendar day and formatRelativeTime returns 'Yesterday'.
    vi.useFakeTimers();
    try {
      const midday = new Date();
      midday.setHours(12, 0, 0, 0);
      vi.setSystemTime(midday);
      expect(formatRelativeTime(new Date(Date.now() - 30_000))).toBe('now');
      expect(formatRelativeTime(new Date(Date.now() - 5 * 60_000))).toBe('5m');
      expect(formatRelativeTime(new Date(Date.now() - 2 * 3_600_000))).toBe('2h');
    } finally {
      vi.useRealTimers();
    }
  });

  it('says "Yesterday" for the previous calendar day', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(12, 0, 0, 0);
    expect(formatRelativeTime(yesterday)).toBe('Yesterday');
  });

  it('degrades invalid/unparseable timestamps to an empty fallback, never "Invalid Date"', () => {
    // Same defect family as formatMessageTime (PersonThread): an unparseable
    // lastActivityAt must not render the literal "Invalid Date" in the
    // People-list row time slot.
    expect(formatRelativeTime(new Date(NaN))).toBe('');
    expect(formatRelativeTime('not-a-date' as unknown as Date)).toBe('');
    expect(formatRelativeTime(undefined as unknown as Date)).toBe('');
  });

  it('formats valid older timestamps unchanged', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 9, 11, 12, 0, 0)); // 11 Oct 2026 midday
      const old = new Date(2026, 8, 21, 9, 30, 0); // 21 Sep 2026
      const expected = old.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      expect(formatRelativeTime(old)).toBe(expected);
      expect(formatRelativeTime(old)).not.toBe('Invalid Date');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('PeopleList invalid-timestamp rows', () => {
  it('renders an empty time slot — never "Invalid Date" — for an unparseable lastActivityAt', () => {
    const conversations = fixtureConversations();
    const broken: PersonConversation = {
      ...conversations[0],
      lastActivityAt: new Date(NaN),
    };
    const el = render(
      <PeopleList
        conversations={[broken]}
        onSelect={() => {}}
        searchQuery=""
        onSearchQuery={() => {}}
      />,
    );

    expect(el.textContent).not.toContain('Invalid Date');
    // The row's time slot (text-xs span) renders empty; name and snippet stay.
    const timeSlot = rowButtons(el)[0].querySelector('span.text-xs');
    expect(timeSlot?.textContent).toBe('');
    expect(el.textContent).toContain(conversations[0].name);
  });
});

// ============================================================================
// PeopleList attachment signal (fix/qm-personthread-attachments).
//
// Rows for conversations with attachments carry a paperclip signal; rows
// without attachments carry none. The signal reflects real message data —
// never inferred, never faked.
// ============================================================================

function fixtureConversationsWithAttachments(): PersonConversation[] {
  const aliceWithFile = email({
    from: { email: 'alice@example.com', name: 'Alice' },
    to: [{ email: ME }],
    subject: 'Files',
    snippet: 'see the attached report',
    isRead: true,
    receivedAt: at('2026-10-10T09:00:00Z'),
    attachments: [
      {
        id: 'a1',
        createdAt: at('2026-10-10T09:00:00Z'),
        updatedAt: at('2026-10-10T09:00:00Z'),
        emailId: 'm-alice',
        filename: 'report.pdf',
        mimeType: 'application/pdf',
        size: 2048,
        url: 'https://example.com/report.pdf',
        isInline: false,
      },
    ],
  });
  const bobPlain = email({
    from: { email: 'bob@example.com', name: 'Bob' },
    to: [{ email: ME }],
    subject: 'Hi',
    snippet: 'just saying hello',
    isRead: true,
    receivedAt: at('2026-10-10T08:00:00Z'),
  });
  return groupEmailsByPerson([aliceWithFile, bobPlain], ME);
}

describe('PeopleList attachment signal', () => {
  it('shows the paperclip signal on rows whose conversation has attachments, and not elsewhere', () => {
    const conversations = fixtureConversationsWithAttachments();
    const el = render(
      <PeopleList
        conversations={conversations}
        onSelect={() => {}}
        searchQuery=""
        onSearchQuery={() => {}}
      />,
    );

    const rows = rowButtons(el);
    expect(rows).toHaveLength(2);
    // Alice's row (newest first) carries the signal; Bob's does not.
    const aliceSignal = rows[0].querySelector('[data-testid="row-attachments"]');
    expect(aliceSignal).not.toBeNull();
    expect(aliceSignal!.getAttribute('aria-label')).toBe('Includes attachments');
    expect(rows[1].querySelector('[data-testid="row-attachments"]')).toBeNull();
  });

  it('shows no paperclip signal when no conversation has attachments', () => {
    const conversations = fixtureConversations();
    const el = render(
      <PeopleList
        conversations={conversations}
        onSelect={() => {}}
        searchQuery=""
        onSearchQuery={() => {}}
      />,
    );
    expect(el.querySelectorAll('[data-testid="row-attachments"]')).toHaveLength(0);
  });
});
